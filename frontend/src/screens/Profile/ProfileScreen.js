// src/screens/Profile/ProfileScreen.js
import React, { useContext, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Image, Alert, TextInput, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../../context/AuthContext';
import { authApi, providerApi, riderApi } from '../../utils/api';
import { colors, spacing, borderRadius, typography, shadow } from '../../styles/theme';

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value || '-'} </Text>
  </View>
);

const ProfileScreen = ({ navigation }) => {
  const { userToken, userRole, signOut } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [details, setDetails] = useState(null);
  const [livePhoto, setLivePhoto] = useState(null);
  const [cameraPermission, setCameraPermission] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [sosName, setSosName] = useState('');
  const [sosMobile, setSosMobile] = useState('');

  const load = async () => {
    if (!userToken) return;
    setLoading(true);
    try {
      const u = await authApi.getProfile(userToken);
      setUser(u);
      // Set SOS contact fields if available
      if (u.sosContact) {
        setSosName(u.sosContact.name || '');
        setSosMobile(u.sosContact.mobileNumber || '');
      }
      if (userRole === 'provider') {
        try { 
          const d = await providerApi.getDetails(userToken);
          setDetails(d); 
          if (d?.livePhotoUrl) {
            await AsyncStorage.setItem('profileLivePhotoUrl', d.livePhotoUrl);
          }
        } catch (_) { setDetails(null); }
      } else if (userRole === 'rider') {
        try { 
          const d = await riderApi.getDetails(userToken);
          setDetails(d);
          if (d?.livePhotoUrl) {
            await AsyncStorage.setItem('profileLivePhotoUrl', d.livePhotoUrl);
          }
        } catch (_) { setDetails(null); }
      }
    } catch (e) {
      setUser(null); setDetails(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    load(); 
    requestCameraPermission();
  }, [userRole]);

  useFocusEffect(
    React.useCallback(() => {
      // On focus, try to show cached photo immediately, then refresh from API
      (async () => {
        try {
          const cached = await AsyncStorage.getItem('profileLivePhotoUrl');
          if (cached) setDetails(prev => ({ ...(prev || {}), livePhotoUrl: cached }));
        } catch (_) {}
        await load();
      })();
      return () => {};
    }, [userRole, userToken])
  );

  const requestCameraPermission = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      setCameraPermission(status === 'granted');
    } catch (e) {
      console.log('Camera permission error:', e);
    }
  };

  const takeLivePhoto = async () => {
    if (!cameraPermission) {
      Alert.alert('Permission required', 'Camera permission is required to take a live photo.');
      return;
    }
    
    // Show warning about front camera requirement
    Alert.alert(
      'Live Photo Required',
      'Please use the front-facing camera to take a selfie for your profile photo.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Take Photo', 
          onPress: async () => {
            try {
              const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
                base64: true,
                cameraType: ImagePicker.CameraType.front, // Force front camera for selfie
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: false,
              });
              if (!result.canceled && result.assets && result.assets.length > 0) {
                setLivePhoto({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
              }
            } catch (err) {
              console.error('Live photo capture failed:', err);
              Alert.alert('Camera Error', 'Failed to capture photo. Please try again.');
            }
          }
        }
      ]
    );
  };

  const updateProfilePhoto = async () => {
    if (!livePhoto) {
      Alert.alert('No Photo', 'Please take a live photo first.');
      return;
    }
    setUpdating(true);
    try {
      const photoData = {
        livePhotoUrl: `data:image/jpeg;base64,${livePhoto.base64}`
      };
      
      if (userRole === 'provider') {
        await providerApi.saveDetails(photoData, userToken);
      } else if (userRole === 'rider') {
        await riderApi.saveDetails(photoData, userToken);
      }
      await AsyncStorage.setItem('profileLivePhotoUrl', photoData.livePhotoUrl);
      
      Alert.alert('Success', 'Profile photo updated successfully!');
      await load(); // Reload to show updated photo
    } catch (e) {
      Alert.alert('Error', 'Failed to update profile photo. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const updateSosContact = async () => {
    if (!sosName.trim() || !sosMobile.trim()) {
      Alert.alert('Error', 'Please enter both name and mobile number');
      return;
    }
    setUpdating(true);
    try {
      await authApi.updateSosContact(sosName.trim(), sosMobile.trim(), userToken);
      setSosModalVisible(false);
      Alert.alert('Success', 'SOS contact updated successfully!');
      // Reload user data to get updated SOS contact
      await load();
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to update SOS contact');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}> 
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* User Profile Photo Section */}
        <View style={styles.photoCard}>
          <Text style={styles.title}>User Profile</Text>
          <View style={styles.photoContainer}>
            {details?.livePhotoUrl ? (
              <Image source={{ uri: details.livePhotoUrl }} style={styles.profilePhoto} />
            ) : livePhoto ? (
              <Image source={{ uri: livePhoto.uri }} style={styles.profilePhoto} />
            ) : (
              <View style={styles.placeholderPhoto}>
                <Text style={styles.placeholderText}>No Photo</Text>
              </View>
            )}
          </View>
          <View style={styles.photoActions}>
            <TouchableOpacity style={styles.photoButton} onPress={takeLivePhoto}>
              <Text style={styles.photoButtonText}>Take Live Photo</Text>
            </TouchableOpacity>
            {livePhoto && (
              <TouchableOpacity 
                style={[styles.photoButton, styles.updateButton]} 
                onPress={updateProfilePhoto}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator color={colors.cardBackground} />
                ) : (
                  <Text style={styles.photoButtonText}>Update Photo</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Account</Text>
          <Row label="Name" value={user?.name} />
          <Row label="Email" value={user?.email} />
          <Row label="Mobile" value={user?.mobileNumber} />
          <Row label="Gender" value={user?.gender} />
          <Row label="Age" value={String(user?.age || '')} />
          <Row label="Role" value={userRole} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.title}>SOS</Text>
            <TouchableOpacity 
              style={styles.editButton} 
              onPress={() => setSosModalVisible(true)}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <Row label="Emergency Contact" value={user?.sosContact?.name || 'Not set'} />
          <Row label="Emergency Mobile" value={user?.sosContact?.mobileNumber || 'Not set'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{userRole === 'provider' ? 'Provider Details' : 'Rider Details'}</Text>
          {userRole === 'provider' ? (
            <>
              <Row label="Vehicle Category" value={details?.vehicleCategory} />
              <Row label="Vehicle Number" value={details?.vehicleNumber} />
              <Row label="RC Number" value={details?.rcNumber} />
              <Row label="Insurance Number" value={details?.insuranceNumber} />
              <Row label="License Number" value={details?.licenseNumber} />
              <Row label="Aadhaar Number" value={details?.aadharNumber} />
            </>
          ) : (
            <>
              <Row label="Aadhaar Number" value={details?.aadharNumber} />
              <Row label="Mobile Number" value={details?.mobileNumber} />
            </>
          )}
          <TouchableOpacity
            style={[styles.button, userRole === 'provider' ? styles.primary : styles.accent]}
            onPress={() => navigation.navigate(userRole === 'provider' ? 'ProviderDetails' : 'RiderDetails')}
          >
            <Text style={styles.buttonText}>{userRole === 'provider' ? 'Edit Provider Details' : 'Edit Rider Details'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.logout]}
          onPress={signOut}
        >
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* SOS Contact Modal */}
      <Modal
        visible={sosModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSosModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Update SOS Contact</Text>
            <Text style={styles.modalSubtitle}>Enter your emergency contact details</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Contact Name"
              value={sosName}
              onChangeText={setSosName}
              placeholderTextColor={colors.textSecondary}
            />
            
            <TextInput
              style={styles.modalInput}
              placeholder="Mobile Number"
              value={sosMobile}
              onChangeText={setSosMobile}
              keyboardType="phone-pad"
              placeholderTextColor={colors.textSecondary}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setSosModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]} 
                onPress={updateSosContact}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator color={colors.cardBackground} />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  photoCard: { backgroundColor: colors.cardBackground, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, alignItems: 'center', ...shadow.default },
  photoContainer: { marginBottom: spacing.md },
  profilePhoto: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: colors.primary },
  placeholderPhoto: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: colors.primary },
  placeholderText: { ...typography.body, color: colors.textSecondary },
  photoActions: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  photoButton: { backgroundColor: colors.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, marginHorizontal: spacing.xs, marginVertical: spacing.xs, ...shadow.button },
  updateButton: { backgroundColor: colors.accent },
  photoButtonText: { ...typography.body, color: colors.cardBackground, fontWeight: 'bold' },
  card: { backgroundColor: colors.cardBackground, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.default },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  rowLabel: { ...typography.body, color: colors.textSecondary },
  rowValue: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  button: { marginTop: spacing.md, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', ...shadow.button },
  buttonText: { ...typography.h4, color: colors.cardBackground, fontWeight: 'bold' },
  primary: { backgroundColor: colors.primary },
  accent: { backgroundColor: colors.accent },
  logout: { backgroundColor: colors.danger },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  editButton: { backgroundColor: colors.primary, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: borderRadius.sm },
  editButtonText: { ...typography.body, color: colors.cardBackground, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '90%', backgroundColor: colors.cardBackground, padding: spacing.lg, borderRadius: borderRadius.lg },
  modalTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  modalSubtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md, ...typography.body, color: colors.textPrimary, backgroundColor: colors.background },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalButton: { flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', marginHorizontal: spacing.xs },
  cancelButton: { backgroundColor: colors.border },
  saveButton: { backgroundColor: colors.primary },
  cancelButtonText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  saveButtonText: { ...typography.body, color: colors.cardBackground, fontWeight: '600' },
});

export default ProfileScreen;


