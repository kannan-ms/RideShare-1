import React, { useEffect, useState, useContext } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Alert, TouchableOpacity, Share, Linking } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { AuthContext } from '../../context/AuthContext';
import { rideApi } from '../../utils/api';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';

const ProviderTrackScreen = ({ route, navigation }) => {
  const { userToken } = useContext(AuthContext);
  const { rideId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [providerPos, setProviderPos] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [userLocation, setUserLocation] = useState(null);

  const fetchProviderLocation = async () => {
    if (!rideId || !userToken) return;
    
    try {
      const res = await rideApi.getProviderLocation(rideId, userToken);
      if (typeof res?.latitude === 'number' && typeof res?.longitude === 'number') {
        setProviderPos({ 
          latitude: res.latitude, 
          longitude: res.longitude 
        });
        setLastUpdated(new Date());
        setError(null);
      } else {
        setError('Provider location not available');
      }
    } catch (e) {
      console.log('Fetch provider location error:', e?.message || e);
      setError('Unable to fetch provider location');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    let intervalId = null;

    const startPolling = () => {
      fetchProviderLocation();
      intervalId = setInterval(() => {
        if (mounted) {
          fetchProviderLocation();
        }
      }, 10000); // Poll every 10 seconds
    };

    const getUserLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          setUserLocation(location.coords);
        }
      } catch (error) {
        console.log('Error getting user location:', error);
      }
    };

    startPolling();
    getUserLocation();

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [rideId, userToken]);

  const handleRefresh = () => {
    setLoading(true);
    fetchProviderLocation();
  };

  const shareLiveLocation = async () => {
    try {
      if (!userLocation) {
        Alert.alert('Location Not Available', 'Unable to get your current location. Please check location permissions.');
        return;
      }

      const { latitude, longitude } = userLocation;
      const timestamp = new Date().toLocaleString();
      
      // Create shareable content
      const shareMessage = `🚗 I'm currently tracking my ride!\n\n📍 My Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n⏰ Time: ${timestamp}\n\n#RideShare #LiveLocation`;
      
      // Create Google Maps link
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      
      // Share options
      const shareOptions = {
        message: `${shareMessage}\n\n🗺️ View on Maps: ${mapsUrl}`,
        url: mapsUrl,
        title: 'My Live Location'
      };

      const result = await Share.share(shareOptions);
      
      if (result.action === Share.sharedAction) {
        console.log('Location shared successfully');
      }
    } catch (error) {
      console.log('Error sharing location:', error);
      Alert.alert('Share Failed', 'Unable to share location. Please try again.');
    }
  };

  const openInMaps = () => {
    if (!userLocation) {
      Alert.alert('Location Not Available', 'Unable to get your current location.');
      return;
    }

    const { latitude, longitude } = userLocation;
    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    
    Linking.openURL(mapsUrl).catch(err => {
      console.log('Error opening maps:', err);
      Alert.alert('Error', 'Unable to open maps application.');
    });
  };

  if (loading && !providerPos) {
    return (
      <View style={styles.center}> 
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Fetching provider location…</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error || !providerPos) {
    return (
      <View style={styles.center}> 
        <Text style={styles.errorText}>{error || 'Provider location not available'}</Text>
        <Text style={styles.subText}>
          The provider may not have enabled live tracking or the ride may not be within the tracking window.
        </Text>
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
          <Text style={styles.refreshButtonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.refreshButton, styles.backButton]} 
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.refreshButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Provider Location</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
      
      {/* Share Location Buttons */}
      <View style={styles.shareSection}>
        <TouchableOpacity style={styles.shareButton} onPress={shareLiveLocation}>
          <Text style={styles.shareButtonText}>📤 Share My Location</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapsButton} onPress={openInMaps}>
          <Text style={styles.mapsButtonText}>🗺️ Open in Maps</Text>
        </TouchableOpacity>
      </View>
      
      {lastUpdated && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </Text>
        </View>
      )}

      <MapView
        style={styles.map}
        initialRegion={{
          latitude: providerPos.latitude,
          longitude: providerPos.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        <Marker 
          coordinate={providerPos} 
          title="Provider Location"
          description="Your ride provider's current location"
          pinColor={colors.primary}
        />
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  backButtonText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: 'bold',
  },
  refreshButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  refreshButtonText: {
    ...typography.body,
    color: colors.cardBackground,
    fontWeight: '600',
  },
  statusBar: {
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  statusText: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 12,
  },
  map: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  errorText: {
    ...typography.h3,
    color: colors.error || '#e74c3c',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  shareSection: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'space-around',
  },
  shareButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    flex: 1,
    marginRight: spacing.sm,
    alignItems: 'center',
  },
  shareButtonText: {
    ...typography.body,
    color: colors.cardBackground,
    fontWeight: '600',
  },
  mapsButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    flex: 1,
    marginLeft: spacing.sm,
    alignItems: 'center',
  },
  mapsButtonText: {
    ...typography.body,
    color: colors.cardBackground,
    fontWeight: '600',
  },
});

export default ProviderTrackScreen;