// src/screens/Rides/RidesScreen.js
// Screen to display available rides and ride management

import React, { useState, useContext, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { AuthContext } from '../../context/AuthContext';
import { rideApi, providerApi, riderApi, ocrApi, getFormattedAddress } from '../../utils/api';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius, typography, shadow } from '../../styles/theme';

const RidesScreen = ({ navigation }) => {
  const { userToken, userRole } = useContext(AuthContext);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [providerDetails, setProviderDetails] = useState(null);
  const [aadharNumber, setAadharNumber] = useState('');
  const [aadharPhoto, setAadharPhoto] = useState(null);
  const [extractedAadhaar, setExtractedAadhaar] = useState('');
  const [mediaLibraryPermission, setMediaLibraryPermission] = useState(null);
  const [aadhaarInfo, setAadhaarInfo] = useState({ name: '', dob: '', gender: '' });

  useEffect(() => {
    loadRides();
    if (userRole === 'provider') {
      loadProviderDetails();
    }
    // Request permission for image library if rider wants to upload Aadhaar on this screen
    const requestPerms = async () => {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setMediaLibraryPermission(status === 'granted');
      } catch (_) {}
    };
    requestPerms();
  }, [userRole]);

  const loadProviderDetails = async () => {
    try {
      const details = await providerApi.getDetails(userToken);
      setProviderDetails(details);
    } catch (error) {
      console.log('No provider details found or error:', error.message);
      setProviderDetails(null);
    }
  };

  const loadRides = async () => {
    setLoading(true);
    try {
      let fetchedRides = [];
      if (userRole === 'provider') {
        const response = await rideApi.getProviderRides(userToken);
        const now = Date.now();
        fetchedRides = (response.rides || []).filter(r => new Date(r.startTime).getTime() > now && r.status === 'created');
      } else {
        // Show available rides to all users (including those without rider details)
        const response = await rideApi.getAvailableRides(userToken);
        fetchedRides = response.rides || [];
      }

      // Replace coordinates with formatted addresses
      const updatedRides = await Promise.all(
        fetchedRides.map(async (ride) => {
          const startAddress = await getFormattedAddress(ride.startPoint);
          const destinationAddress = await getFormattedAddress(ride.destination);
          return {
            ...ride,
            startPoint: startAddress || ride.startPoint,
            destination: destinationAddress || ride.destination,
          };
        })
      );

      setRides(updatedRides);
    } catch (error) {
      console.error('Load rides error:', error);
      // Fallback to mock data if API fails
      const mockRides = [
        {
          id: '1',
          startPoint: 'Mumbai Central',
          destination: 'Andheri',
          startTime: new Date(Date.now() + 3600000),
          rideCost: 150,
          vehicleCategory: 'Car',
          provider: { name: 'John Doe', mobileNumber: '9876543210' },
          status: 'created'
        },
        {
          id: '2',
          startPoint: 'Bandra',
          destination: 'Dadar',
          startTime: new Date(Date.now() + 7200000),
          rideCost: 80,
          vehicleCategory: 'Bike',
          provider: { name: 'Jane Smith', mobileNumber: '9876543211' },
          status: 'created'
        }
      ];
      setRides(mockRides);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRides();
    if (userRole === 'provider') {
      await loadProviderDetails();
    }
    setRefreshing(false);
  };

  const handleRideAction = (ride, action) => {
    if (userRole === 'rider') {
      if (action === 'book') {
        // Gate: require rider details
        checkRiderVerifiedThen(() => {
          Alert.alert(
            'Book Ride',
            `Confirm booking for ride from ${ride.startPoint} to ${ride.destination}?\nPrice: ₹${ride.rideCost}\nTime: ${new Date(ride.startTime).toLocaleString()}`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Book', onPress: () => bookRide(ride) }
            ]
          );
        });
      }
    } else if (userRole === 'provider') {
      if (action === 'manage') {
        Alert.alert(
          'Manage Ride',
          `Manage your ride from ${ride.startPoint} to ${ride.destination}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete Ride', style: 'destructive', onPress: () => confirmDeleteRide(ride) },
          ]
        );
      }
    }
  };

  const checkRiderVerifiedThen = async (onOk) => {
    try {
      const details = await riderApi.getDetails(userToken);
      const ok = !!(details?.aadharNumber && details?.mobileNumber);
      if (ok) return onOk();
      Alert.alert(
        'Details Required',
        'Please complete your rider details (Aadhaar and mobile) before booking.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Update Now', onPress: () => navigation.navigate('RiderDetails') }
        ]
      );
    } catch (_) {
      Alert.alert(
        'Details Required',
        'Please complete your rider details (Aadhaar and mobile) before booking.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Update Now', onPress: () => navigation.navigate('RiderDetails') }
        ]
      );
    }
  };

  const bookRide = async (ride) => {
    try {
      const rideId = ride._id || ride.id;
      await rideApi.bookRide(rideId, userToken);
      Alert.alert(
        'Request Sent',
        "Your request was sent to the provider. Track status in the 'Messages' tab.",
        [
          { text: 'OK' },
          { text: 'Go to Messages', onPress: () => (typeof navigation?.navigate === 'function' ? navigation.navigate('Messages') : null) }
        ]
      );
      // Refresh rides to update any local state if needed
      loadRides();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to send booking request. Please try again.');
    }
  };

  const confirmDeleteRide = (ride) => {
    Alert.alert(
      'Delete Ride',
      'Are you sure you want to delete this ride? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteRide(ride) },
      ]
    );
  };

  const viewProviderDetails = async (ride) => {
    try {
      const providerId = ride.provider?._id || ride.provider?.id || ride.provider;
      if (!providerId) {
        Alert.alert('Info', 'Provider details not available.');
        return;
      }
      const res = await providerApi.getPublicByUserId(providerId, userToken);
      const d = res?.providerDetails;
      if (!d) {
        Alert.alert('Info', 'Provider details not found.');
        return;
      }
      const msg = `Category: ${d.vehicleCategory || '-'}\nVehicle: ${d.vehicleNumber || '-'}\nRC: ${d.rcNumber || '-'}\nInsurance: ${d.insuranceNumber || '-'}\nLicense: ${d.licenseNumber || '-'}\nAadhaar: ${d.aadharNumber || '-'}${d.vehicleType ? `\nType: ${d.vehicleType}` : ''}`;
      Alert.alert('Provider Details', msg, [{ text: 'OK' }]);
    } catch (e) {
      Alert.alert('Error', 'Failed to load provider details.');
    }
  };

  const deleteRide = async (ride) => {
    try {
      await rideApi.deleteRide(ride._id || ride.id, userToken);
      Alert.alert('Deleted', 'Ride deleted successfully.');
      await loadRides();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to delete ride.');
    }
  };

  const handleCreateRide = () => {
    if (!providerDetails) {
      Alert.alert(
        'Vehicle Details Required',
        'Please complete your vehicle details before creating a ride.',
        [
          { text: 'Update Vehicle Details', onPress: () => navigation.navigate('ProviderDetails') },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } else {
      navigation.navigate('CreateRide');
    }
  };

  // Aadhaar upload + OCR for riders on this page
  const uploadAadhaarForBooking = async () => {
    try {
      if (!mediaLibraryPermission) {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setMediaLibraryPermission(status === 'granted');
        if (status !== 'granted') {
          Alert.alert('Permission required', 'Media library permission is required to upload photos.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, // keep editing but do not force aspect to avoid diagonal crop
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const imageData = { uri: asset.uri, base64: asset.base64 };
      setAadharPhoto(imageData);
      if (asset.base64 && userToken) {
        const { text } = await ocrApi.extractText(`data:image/jpeg;base64,${asset.base64}`, userToken);
        if (text && typeof text === 'string') {
          const aadMatch = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
          if (aadMatch) {
            const normalized = aadMatch[0].replace(/\s/g, '');
            setAadharNumber(normalized);
            setExtractedAadhaar(normalized);
            // Extract name, DOB/YOB, and gender from OCR text
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            // Gender
            const genderMatch = text.match(/\b(MALE|FEMALE|OTHER)\b/i);
            const gender = genderMatch ? (genderMatch[0].charAt(0).toUpperCase() + genderMatch[0].slice(1).toLowerCase()) : '';
            // DOB or YOB
            let dob = '';
            const dobLineMatch = text.match(/(dob|date\s*of\s*birth|yob|year\s*of\s*birth)[^\d]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\b\d{4}\b)/i);
            if (dobLineMatch) {
              dob = dobLineMatch[2];
            } else {
              const anyDate = text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
              dob = anyDate ? anyDate[0] : '';
            }
            // Name
            let name = '';
            const nameLabelMatch = text.match(/name\s*[:\-]?\s*([A-Za-z ,.']{3,})/i);
            if (nameLabelMatch) {
              name = nameLabelMatch[1].trim();
            } else {
              const exclude = /(government|india|unique|identification|authority|aadhaar|address|dob|yob|date|gender|male|female|year|of|birth)/i;
              const candidate = lines.find(l => /[A-Za-z]{3,}/.test(l) && !exclude.test(l));
              if (candidate) name = candidate.replace(/^[^A-Za-z]*/, '').trim();
            }
            setAadhaarInfo({ name, dob, gender });
            let msg = `Detected Aadhaar: ${normalized}`;
            if (name) msg += `\nName: ${name}`;
            if (dob) msg += `\nDOB/YOB: ${dob}`;
            if (gender) msg += `\nGender: ${gender}`;
            Alert.alert('Aadhaar Detected', msg);
          } else {
            Alert.alert('OCR', 'No Aadhaar number detected. Please try a clearer image.');
          }
        } else {
          Alert.alert('OCR', 'No text detected in the image.');
        }
      }
    } catch (e) {
      console.error('Aadhaar upload/OCR failed:', e);
      Alert.alert('Error', 'Failed to process Aadhaar image. Please try again.');
    }
  };

  const renderRideCard = (ride) => {
    const formatTime = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    return (
      <View key={ride._id || ride.id} style={styles.rideCard}>
        <View style={styles.rideHeader}>
          <Text style={styles.routeText}>{ride.startPoint} → {ride.destination}</Text>
          <Text style={styles.priceText}>₹{ride.rideCost}</Text>
        </View>
        
        <View style={styles.rideDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Vehicle:</Text>
            <Text style={styles.detailValue}>{ride.vehicleCategory}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Provider:</Text>
            <Text style={styles.detailValue}>
              {ride.provider?.name || 'Unknown'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Start Time:</Text>
            <Text style={styles.detailValue}>{formatTime(ride.startTime)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status:</Text>
            <Text style={styles.detailValue}>{ride.status}</Text>
          </View>
          {ride.womenOnly && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Women Only:</Text>
              <Text style={styles.detailValue}>Yes</Text>
            </View>
          )}
        </View>
        
        <View style={styles.rideActions}>
          {userRole === 'rider' ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.bookButton]}
                onPress={() => handleRideAction(ride, 'book')}
              >
                <Text style={styles.actionButtonText}>Book Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.manageButton]}
                onPress={() => viewProviderDetails(ride)}
              >
                <Text style={styles.actionButtonText}>View Provider Details</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, styles.manageButton]}
              onPress={() => handleRideAction(ride, 'manage')}
            >
              <Text style={styles.actionButtonText}>Manage Ride</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {userRole === 'rider' ? 'Available Rides' : 'Your Rides'}
        </Text>
        <Text style={styles.subtitle}>
          {userRole === 'rider' 
            ? 'Browse available rides - complete your details to book' 
            : 'Manage your ride offerings'
          }
        </Text>
      </View>

      {/* Profile Management Section */}
      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>Profile Management</Text>
        <View style={styles.profileButtons}>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => {
              if (userRole === 'rider') {
                navigation.navigate('RiderDetails');
              } else {
                navigation.navigate('ProviderDetails');
              }
            }}
          >
            <Text style={styles.profileButtonText}>
              {userRole === 'rider' ? 'Update Rider Details' : 'Update Vehicle Details'}
            </Text>
          </TouchableOpacity>
          

          {userRole === 'rider' && (
            <TouchableOpacity
              style={styles.profileButton}
              onPress={uploadAadhaarForBooking}
            >
              <Text style={styles.profileButtonText}>Upload Aadhaar for Booking</Text>
            </TouchableOpacity>
          )}

          {userRole === 'rider' && (extractedAadhaar || aadhaarInfo.name || aadhaarInfo.dob || aadhaarInfo.gender) ? (
            <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
              {extractedAadhaar ? (
                <Text style={{ ...typography.body, color: colors.textSecondary }}>Extracted Aadhaar: {extractedAadhaar}</Text>
              ) : null}
              {aadhaarInfo.name ? (
                <Text style={{ ...typography.body, color: colors.textSecondary }}>Name: {aadhaarInfo.name}</Text>
              ) : null}
              {aadhaarInfo.dob ? (
                <Text style={{ ...typography.body, color: colors.textSecondary }}>DOB/YOB: {aadhaarInfo.dob}</Text>
              ) : null}
              {aadhaarInfo.gender ? (
                <Text style={{ ...typography.body, color: colors.textSecondary }}>Gender: {aadhaarInfo.gender}</Text>
              ) : null}
            </View>
          ) : null}
          
          {userRole === 'provider' && (
            <TouchableOpacity
              style={[styles.profileButton, styles.createRideButton]}
              onPress={handleCreateRide}
            >
              <Text style={styles.profileButtonText}>Create New Ride</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.profileButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading rides...</Text>
          </View>
        ) : rides.length > 0 ? (
          rides.map(renderRideCard)
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No rides available at the moment.</Text>
            <Text style={styles.emptySubtext}>Check back later or try refreshing.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          disabled={loading}
        >
          <Text style={styles.refreshButtonText}>Refresh Rides</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    padding: spacing.lg,
    alignItems: 'center',
  },
  title: {
    ...typography.h1,
    color: colors.cardBackground,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.cardBackground,
    opacity: 0.9,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  rideCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.default,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  routeText: {
    ...typography.h2,
    color: colors.textPrimary,
    flex: 1,
  },
  priceText: {
    ...typography.h2,
    color: colors.accent,
    fontWeight: 'bold',
  },
  rideDetails: {
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  detailLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  detailValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  rideActions: {
    alignItems: 'center',
  },
  actionButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    minWidth: 120,
    alignItems: 'center',
    ...shadow.button,
  },
  bookButton: {
    backgroundColor: colors.accent,
  },
  manageButton: {
    backgroundColor: colors.primary,
  },
  actionButtonText: {
    color: colors.cardBackground,
    ...typography.h3,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  emptyText: {
    ...typography.h2,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  refreshButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    ...shadow.button,
  },
  refreshButtonText: {
    color: colors.cardBackground,
    ...typography.h3,
    fontWeight: 'bold',
  },
  profileSection: {
    backgroundColor: colors.cardBackground,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    ...shadow.default,
  },
  profileSectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  profileButtons: {
    flexDirection: 'column',
  },
  profileButton: {
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    ...shadow.button,
  },
  profileButtonText: {
    color: colors.textPrimary,
    ...typography.h4,
    fontWeight: 'bold',
  },
  createRideButton: {
    backgroundColor: colors.accent,
  },
  bookRideButton: {
    backgroundColor: colors.primaryLight,
  },
});

export default RidesScreen;
