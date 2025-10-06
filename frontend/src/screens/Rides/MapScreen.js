import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Dimensions, TouchableOpacity, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { GOOGLE_MAPS_API_KEY } from '../../config/googleMapsConfig';

const INITIAL_REGION = {
  latitude: 11.0168, // Coimbatore
  longitude: 76.9558,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const MapScreen = ({ onSelectLocation, mode, onCancel }) => {
  const [startLocation, setStartLocation] = useState(null);
  const [endLocation, setEndLocation] = useState(null);
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [hasPermission, setHasPermission] = useState(false);
  const [mapRegion, setMapRegion] = useState(INITIAL_REGION); // Add state for map region
  const [hint, setHint] = useState('');

  useEffect(() => {
    const requestPermissions = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setHasPermission(true);
      } else {
        console.error('Location permission not granted');
      }
    };

    requestPermissions();
  }, []);

  useEffect(() => {
    if (!startLocation) {
      setHint('Long press on the map to select Start Location');
    } else if (!endLocation) {
      setHint('Long press on the map to select Destination');
    } else {
      setHint('');
    }
  }, [startLocation, endLocation]);

  const fetchAddress = async (latitude, longitude) => {
    // Try Google first if API key is available, then fall back to OpenStreetMap Nominatim
    const buildShortFromGoogle = (result) => {
      const comps = result?.address_components || [];
      const byType = (type) => comps.find(c => c.types?.includes(type))?.long_name;
      const sublocality = byType('sublocality') || byType('sublocality_level_1') || byType('neighborhood');
      const locality = byType('locality');
      const admin2 = byType('administrative_area_level_2');
      const admin1 = byType('administrative_area_level_1');
      const country = byType('country');
      const left = sublocality || locality || admin2;
      const right = locality && sublocality ? locality : (admin2 || admin1 || country);
      if (left && right) return `${left}, ${right}`;
      return result?.formatted_address || 'Unknown Address';
    };

    try {
      if (GOOGLE_MAPS_API_KEY) {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`);
        const data = await response.json();
        if (data?.results?.length) {
          const shortLabel = buildShortFromGoogle(data.results[0]);
          const fullLabel = data.results[0]?.formatted_address || shortLabel;
          return { shortLabel, fullLabel };
        }
      }
    } catch (error) {
      console.error('Google geocode failed:', error?.message || error);
    }

    // Fallback: OpenStreetMap Nominatim (usage policy friendly rate only; for dev/testing)
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RideShareApp/1.0 (+https://example.com)'
        }
      });
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Non-JSON response from OSM');
      }
      const nomi = await resp.json();
      if (nomi?.address) {
        const a = nomi.address;
        const left = a.suburb || a.neighbourhood || a.village || a.town || a.city_district || a.city;
        const right = a.city || a.town || a.village || a.state || a.county;
        const shortLabel = left && right ? `${left}, ${right}` : (nomi.display_name || 'Unknown Address');
        const fullLabel = nomi.display_name || shortLabel;
        return { shortLabel, fullLabel };
      }
    } catch (e) {
      console.error('OSM reverse geocode failed:', e?.message || e);
    }

    console.warn('No address found for the location');
    return { shortLabel: 'Unknown Address', fullLabel: 'Unknown Address' };
  };

  const handleLongPress = async (event) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;

    if (!startLocation) {
      setStartLocation({ latitude, longitude });
      const addr = await fetchAddress(latitude, longitude);
      setStartAddress(addr.shortLabel);
      onSelectLocation({ latitude, longitude, address: addr.fullLabel });
    } else if (!endLocation) {
      setEndLocation({ latitude, longitude });
      const addr = await fetchAddress(latitude, longitude);
      setEndAddress(addr.shortLabel);
      onSelectLocation({ latitude, longitude, address: addr.fullLabel });
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={mapRegion} // Use region instead of initialRegion
        onRegionChangeComplete={(region) => setMapRegion(region)} // Update region state on map movement
        onLongPress={handleLongPress}
      >
        {startLocation && (
          <Marker
            coordinate={startLocation}
            title="Start Location"
            description={startAddress || 'Fetching address...'}
            pinColor="green"
          />
        )}
        {endLocation && (
          <Marker
            coordinate={endLocation}
            title="End Location"
            description={endAddress || 'Fetching address...'}
            pinColor="red"
          />
        )}
      </MapView>

      <View style={styles.addressContainer}>
        {hint ? <Text style={styles.hintText}>{hint}</Text> : null}
        {startAddress && <Text style={styles.addressText}>Start Location: {startAddress}</Text>}
        {endAddress && <Text style={styles.addressText}>End Location: {endAddress}</Text>}
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  addressContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 5,
    elevation: 5,
  },
  addressText: {
    fontSize: 16,
    color: 'black',
    marginBottom: 5,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
  cancelButton: {
    backgroundColor: 'red',
    padding: 10,
    borderRadius: 5,
  },
  cancelButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default MapScreen;