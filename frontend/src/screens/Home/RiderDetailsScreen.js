// src/screens/Home/RiderDetailsScreen.js
// Final fix for photo upload permissions and graceful error handling for new users.

import React, { useState, useContext, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../../context/AuthContext';
import { riderApi, ocrApi } from '../../utils/api';
import { colors, spacing, borderRadius, typography, shadow } from '../../styles/theme';
import { matchAadhaar } from '../../utils/fuzzyMatch';

const RiderDetailsScreen = ({ navigation }) => {
  const { userToken, userRole } = useContext(AuthContext);

  const [aadharNumber, setAadharNumber] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [aadharPhoto, setAadharPhoto] = useState(null);
  const [livePhoto, setLivePhoto] = useState(null);

  const [aadharVerified, setAadharVerified] = useState(false);
  const [extractedAadhaar, setExtractedAadhaar] = useState('');

  const [loading, setLoading] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(true);

  // New state to hold permission status
  const [mediaLibraryPermission, setMediaLibraryPermission] = useState(null);
  const [cameraPermission, setCameraPermission] = useState(null);

  // Request permissions when the component mounts
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        console.log('Requesting media library permission...');
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        console.log('Media library permission status:', status);
        setMediaLibraryPermission(status === 'granted');
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        setCameraPermission(cam.status === 'granted');
      } catch (error) {
        console.error('Error requesting media library permission:', error);
        Alert.alert('Permission Error', 'Failed to request media library permission. Please try again.');
      }
    };
    requestPermissions();

    const fetchDetails = async () => {
      if (userToken && userRole === 'rider') {
        try {
          const existingDetails = await riderApi.getDetails(userToken);
          if (existingDetails) {
            // Only set photo if it exists, don't auto-fill text fields
            setAadharPhoto(existingDetails.aadharPhotoUrl ? { uri: existingDetails.aadharPhotoUrl } : null);
            setLivePhoto(existingDetails.livePhotoUrl ? { uri: existingDetails.livePhotoUrl } : null);
            setAadharVerified(existingDetails.aadharVerified);
            // Don't auto-fill aadharNumber and mobileNumber - let users enter them manually
          }
        } catch (error) {
          console.error('Failed to fetch rider details:', error);
          // FIX: Only show an alert for a real error (not a 404 Not Found)
          if (error.message !== 'Rider details not found.') {
             Alert.alert('Error', 'Could not load existing details. Please try again.');
          }
        } finally {
          setFetchingDetails(false);
        }
      } else {
        setFetchingDetails(false);
      }
    };
    fetchDetails();
  }, [userToken, userRole]);

  const pickImage = async (setImageFunction, documentType = null) => {
    console.log('pickImage called, mediaLibraryPermission:', mediaLibraryPermission);
    console.log('Document type:', documentType);
    
    if (!mediaLibraryPermission) {
      console.log('No media library permission, requesting...');
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        console.log('New media library permission status:', status);
        setMediaLibraryPermission(status === 'granted');
        
        if (status !== 'granted') {
          Alert.alert('Permission required', 'Media library permission is required to upload photos!');
          return;
        }
      } catch (error) {
        console.error('Error requesting media library permission:', error);
        Alert.alert('Permission Error', 'Failed to request media library permission.');
        return;
      }
    }

    try {
      console.log('Launching image picker...');
      console.log('ImagePicker object:', ImagePicker);
      console.log('ImagePicker methods:', Object.keys(ImagePicker));
      
      let result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
        base64: true,
      });
      
      console.log('Image picker result:', result);
      console.log('Result canceled:', result.canceled);
      console.log('Result assets:', result.assets);
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        console.log('Image selected, setting image...');
        const imageData = { uri: result.assets[0].uri, base64: result.assets[0].base64 };
        console.log('Image data URI length:', imageData.uri ? imageData.uri.length : 'No URI');
        console.log('Image data base64 length:', imageData.base64 ? imageData.base64.length : 'No base64');
        setImageFunction(imageData);
        
        // Perform OCR verification for Aadhaar document using backend OCR
        if (documentType === 'aadhar' && imageData.base64 && userToken) {
          try {
            console.log('Performing OCR verification for Aadhaar...');
            Alert.alert('OCR Processing', 'Analyzing Aadhaar card... Please wait.');
            const { text } = await ocrApi.extractText(`data:image/jpeg;base64,${imageData.base64}`, userToken);
            if (text && typeof text === 'string') {
              const aadMatch = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
              if (aadMatch) {
                const normalized = aadMatch[0].replace(/\s/g, '');
                setAadharNumber(normalized);
                setExtractedAadhaar(normalized);
                Alert.alert('OCR Success - Aadhaar', `Detected Aadhaar: ${normalized}`);
              } else {
                Alert.alert('OCR Warning', 'Could not extract Aadhaar number. Please ensure the image is clear and contains readable text.');
              }
            } else {
              Alert.alert('OCR Warning', 'No text detected in the image.');
            }
          } catch (ocrError) {
            console.error('OCR verification failed:', ocrError);
            Alert.alert('OCR Error', 'Failed to process Aadhaar card. Please try again with a clearer image.');
          }
        }
      } else {
        console.log('Image selection canceled or no assets');
      }
    } catch (error) {
      console.error('Error in pickImage:', error);
      // Try fallback approach if the first method fails
      try {
        console.log('Trying fallback image picker method...');
        let fallbackResult = await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.5,
          base64: true,
        });
        
        if (!fallbackResult.canceled && fallbackResult.assets && fallbackResult.assets.length > 0) {
          console.log('Fallback image picker successful');
          const imageData = { uri: fallbackResult.assets[0].uri, base64: fallbackResult.assets[0].base64 };
          setImageFunction(imageData);
          
          // Perform OCR verification for Aadhaar document using backend OCR
          if (documentType === 'aadhar' && imageData.base64 && userToken) {
            try {
              console.log('Performing OCR verification for Aadhaar (fallback method)...');
              Alert.alert('OCR Processing', 'Analyzing Aadhaar card... Please wait.');
              const { text } = await ocrApi.extractText(`data:image/jpeg;base64,${imageData.base64}`, userToken);
              if (text && typeof text === 'string') {
                const aadMatch = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
                if (aadMatch) {
                  const normalized = aadMatch[0].replace(/\s/g, '');
                  setAadharNumber(normalized);
                  setExtractedAadhaar(normalized);
                  Alert.alert('OCR Success - Aadhaar', `Detected Aadhaar: ${normalized}`);
                } else {
                  Alert.alert('OCR Warning', 'Could not extract Aadhaar number. Please ensure the image is clear and contains readable text.');
                }
              } else {
                Alert.alert('OCR Warning', 'No text detected in the image.');
              }
            } catch (ocrError) {
              console.error('OCR verification failed (fallback method):', ocrError);
              Alert.alert('OCR Error', 'Failed to process Aadhaar card. Please try again with a clearer image.');
            }
          }
        }
      } catch (fallbackError) {
        console.error('Fallback image picker also failed:', fallbackError);
        Alert.alert('Error', 'Failed to pick image. Please try again or restart the app.');
      }
    }
  };

  const takeLivePhoto = async () => {
    if (!cameraPermission) {
      Alert.alert('Permission required', 'Camera permission is required to take a live photo.');
      return;
    }
    try {
      let result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setLivePhoto({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
      }
    } catch (err) {
      console.error('Live photo capture failed:', err);
      Alert.alert('Camera Error', 'Failed to capture photo. Please try again.');
    }
  };

  const handleSaveDetails = async () => {
    // Block save when mismatch between entered and extracted Aadhaar exists
    const aadMismatch = extractedAadhaar && aadharNumber && !matchAadhaar(aadharNumber, extractedAadhaar).isMatch;
    if (aadMismatch) {
      Alert.alert('Mismatch detected', 'Your entered Aadhaar number does not match the extracted document data. Please review the mismatch shown and correct it before saving.');
      return;
    }
    setLoading(true);
    try {
      const details = {
        aadharNumber,
        mobileNumber,
        aadharPhotoUrl: aadharPhoto ? `data:image/jpeg;base64,${aadharPhoto.base64}` : null,
        livePhotoUrl: livePhoto ? `data:image/jpeg;base64,${livePhoto.base64}` : null,
      };

      const data = await riderApi.saveDetails(details, userToken);
      
      // Show success with OCR verification summary
      let ocrSummary = '';
      if (aadharNumber && aadharPhoto) {
        ocrSummary = '\n\nOCR Verification Summary:\n';
        ocrSummary += `• Aadhaar Number: ${aadharNumber}\n`;
        ocrSummary += `• Document: Uploaded and verified\n`;
      }
      
      Alert.alert(
        'Success!', 
        `${data.message}${ocrSummary}\n\nAll details have been saved successfully. You can now request rides!`,
        [
          {
            text: 'Continue to Rides',
            onPress: () => {
              // Navigate to rides page (nested under Tabs)
              navigation.navigate('Tabs', { screen: 'Rides' });
            }
          },
          {
            text: 'Stay Here',
            style: 'cancel'
          }
        ]
      );

      setAadharVerified(data.riderDetails.aadharVerified);

    } catch (error) {
      console.error('Save rider details error:', error);
      Alert.alert('Error', error.message || 'Failed to save details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingDetails) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading rider details...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Your Rider Details</Text>
          <Text style={styles.subtitle}>Help us verify your identity for safe rides.</Text>

          {/* Profile Management Section */}
          <View style={styles.profileManagementSection}>
            <Text style={styles.sectionTitle}>Profile Management</Text>
            <View style={styles.profileActionButtons}
            >
              <TouchableOpacity
                style={[styles.profileActionButton, styles.profileActionButtonFull]}
                onPress={() => navigation.navigate('Tabs', { screen: 'Rides' })}
              >
                <Text style={styles.profileActionButtonText}>View Available Rides</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.profileActionButton, styles.profileActionButtonFull]}
                onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}
              >
                <Text style={styles.profileActionButtonText}>Back to Home</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Aadhaar Number */}
          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.inputWithButton]}
              placeholder="Aadhaar Number"
              placeholderTextColor={colors.placeholder}
              value={aadharNumber}
              onChangeText={setAadharNumber}
              keyboardType="numeric"
              maxLength={12}
            />
            <TouchableOpacity style={styles.uploadButton} onPress={() => pickImage(setAadharPhoto, 'aadhar')}>
              <Text style={styles.uploadButtonIcon}>📷</Text>
            </TouchableOpacity>
            {aadharVerified && <Text style={styles.verifiedText}>Verified</Text>}
            {aadharPhoto && <Image source={{ uri: aadharPhoto.uri }} style={styles.thumbnail} />}
            {extractedAadhaar ? (
              <Text style={styles.extractedText}>Extracted: {extractedAadhaar}{aadharNumber && !matchAadhaar(aadharNumber, extractedAadhaar).isMatch ? ' • Mismatch' : ''}</Text>
            ) : null}
          </View>

          {/* Mobile Number */}
          <TextInput
            style={styles.input}
            placeholder="Mobile Number"
            placeholderTextColor={colors.placeholder}
            value={mobileNumber}
            onChangeText={setMobileNumber}
            keyboardType="phone-pad"
            editable={true}
          />

          {/* Live Photo */}
          <View style={styles.livePhotoSection}>
            <Text style={styles.sectionTitle}>Live Photo</Text>
            <TouchableOpacity style={styles.cameraButton} onPress={takeLivePhoto}>
              <Text style={styles.uploadButtonIcon}>📷</Text>
            </TouchableOpacity>
            {livePhoto && <Image source={{ uri: livePhoto.uri }} style={styles.thumbnail} />}
          </View>

          {/* Clear Form Button */}
          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={() => {
              Alert.alert(
                'Clear Form',
                'Are you sure you want to clear all form data? This action cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      setAadharNumber('');
                      setMobileNumber('');
                      setAadharPhoto(null);
                      setAadharVerified(false);
                      setLivePhoto(null);
                    }
                  }
                ]
              );
            }}
          >
            <Text style={styles.clearButtonText}>Clear Form</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveDetails}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.cardBackground} />
            ) : (
              <Text style={styles.buttonText}>Save Details</Text>
            )}
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...shadow.default,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing.xxl,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  inputGroup: {
    width: '100%',
    marginBottom: spacing.md,
    position: 'relative',
  },
  input: {
    width: '100%',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  inputWithButton: {
    paddingRight: 110,
  },
  uploadButton: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    ...shadow.button,
    shadowColor: colors.accent,
  },
  uploadButtonIcon: {
    color: colors.cardBackground,
    fontSize: 20,
    fontWeight: '600',
  },
  saveButton: {
    width: '100%',
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    marginTop: spacing.xl,
    ...shadow.button,
  },
  buttonText: {
    color: colors.cardBackground,
    ...typography.h2,
    fontSize: 18,
    fontWeight: 'bold',
  },
  thumbnail: {
    width: '100%',
    height: 150,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
    resizeMode: 'contain',
    backgroundColor: colors.border,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
  verifiedText: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.md + 20,
    color: colors.accent,
    fontWeight: 'bold',
    fontSize: typography.small.fontSize,
  },
  extractedText: {
    ...typography.small,
    color: colors.textSecondary,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  unverifiedText: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.md + 20,
    color: colors.danger,
    fontWeight: 'bold',
    fontSize: typography.small.fontSize,
  },
  clearButton: {
    backgroundColor: colors.danger,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignSelf: 'stretch',
    ...shadow.button,
  },
  clearButtonText: {
    color: colors.cardBackground,
    ...typography.h2,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  profileManagementSection: {
    width: '100%',
    marginBottom: spacing.xxl,
    padding: spacing.md,
    backgroundColor: colors.lightGray,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
    color: colors.textPrimary,
  },
  profileActionButtons: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    width: '100%',
  },
  profileActionButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    ...shadow.button,
  },
  profileActionButtonFull: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  livePhotoSection: {
    width: '100%',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  cameraButton: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    ...shadow.button,
  },
  profileActionButtonText: {
    color: colors.cardBackground,
    ...typography.h2,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default RiderDetailsScreen;
