// src/screens/Home/HomeScreen.js
// This screen allows authenticated users to view and change their role with enhanced, responsive styling.

import React, { useState, useContext, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert, // Keep Alert imported for other potential errors
} from 'react-native';
import { AuthContext } from '../../context/AuthContext';
import { authApi, providerApi, riderApi } from '../../utils/api';
import { colors, spacing, borderRadius, typography, shadow } from '../../styles/theme';

const HomeScreen = ({ navigation }) => {
  const { userToken, userRole, setUserRole } = useContext(AuthContext);
  const [loadingRoleUpdate, setLoadingRoleUpdate] = useState(false);
  const [userName, setUserName] = useState('User');

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (userToken) {
        try {
          const userData = await authApi.getProfile(userToken);
          setUserName(userData.name);
        } catch (error) {
          console.error('Failed to fetch user profile:', error);
          Alert.alert('Error', 'Could not fetch user profile.'); // Keep this alert for errors
        }
      }
    };
    fetchUserProfile();
  }, [userToken]);

  // Function to check if user has already filled their details
  const checkUserDetails = async (role) => {
    try {
      if (role === 'rider') {
        const riderDetails = await riderApi.getDetails(userToken);
        return riderDetails && riderDetails.aadharNumber && riderDetails.mobileNumber;
      } else if (role === 'provider') {
        const providerDetails = await providerApi.getDetails(userToken);
        return providerDetails && providerDetails.vehicleNumber && providerDetails.rcNumber;
      }
      return false;
    } catch (error) {
      // If details not found or any other error, user needs to fill details
      return false;
    }
  };

  const handleRoleChange = async (newRole) => {
    if (userRole === newRole) {
      // If role is already selected, check if details are filled
      const hasDetails = await checkUserDetails(newRole);
      if (hasDetails) {
        // User has details, go directly to rides page
        navigation.navigate('Rides');
      } else {
        // User doesn't have details, go to details screen first
        if (newRole === 'rider') {
          navigation.navigate('RiderDetails');
        } else if (newRole === 'provider') {
          navigation.navigate('ProviderDetails');
        }
      }
      return;
    }

    setLoadingRoleUpdate(true);
    try {
      const data = await authApi.updateRole(newRole, userToken);
      setUserRole(data.newRole);
      
      // After successful role change, check if user has details
      const hasDetails = await checkUserDetails(data.newRole);
      if (hasDetails) {
        // User has details, go directly to rides page
        navigation.navigate('Rides');
      } else {
        // User doesn't have details, go to details screen first
        if (data.newRole === 'rider') {
          navigation.navigate('RiderDetails');
        } else if (data.newRole === 'provider') {
          navigation.navigate('ProviderDetails');
        }
      }
    } catch (error) {
      console.error('Role update error:', error);
      Alert.alert('Role Update Failed', error.message || 'Network error or server unavailable.');
    } finally {
      setLoadingRoleUpdate(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Hello, {userName}!</Text>
        <Text style={styles.subtitle}>Welcome to RideShare!</Text>
        <Text style={styles.flowText}>
          Find and book rides, or offer your own rides safely. Use the tabs below to explore Rides, Messages, Create Ride, and your Profile.
        </Text>

        <TouchableOpacity
          style={[styles.button, userRole === 'rider' && styles.activeRoleButton]}
          onPress={() => handleRoleChange('rider')}
          disabled={loadingRoleUpdate && userRole !== 'rider'}
        >
          {loadingRoleUpdate && userRole !== 'rider' ? (
            <ActivityIndicator color={colors.cardBackground} />
          ) : (
            <Text style={styles.buttonText}>
              {userRole === 'rider' ? 'Request a Ride' : 'Become a Rider'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, userRole === 'provider' && styles.activeRoleButton]}
          onPress={() => handleRoleChange('provider')}
          disabled={loadingRoleUpdate && userRole !== 'provider'}
        >
          {loadingRoleUpdate && userRole !== 'provider' ? (
            <ActivityIndicator color={colors.cardBackground} />
          ) : (
            <Text style={styles.buttonText}>
              {userRole === 'provider' ? 'Provide a Ride' : 'Become a Provider'}
            </Text>
          )}
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    marginBottom: spacing.lg,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  currentRoleText: {
    ...typography.h2,
    fontSize: 20,
    marginBottom: spacing.xxl,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  roleText: {
    fontWeight: 'bold',
    textTransform: 'capitalize',
    color: colors.primary,
  },
  instructionText: {
    ...typography.body,
    marginBottom: spacing.md,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  flowText: {
    ...typography.body,
    marginBottom: spacing.xxl,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  button: {
    width: '100%',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadow.button,
  },
  activeRoleButton: {
    backgroundColor: colors.accent,
    ...shadow.button,
    shadowColor: colors.accent,
  },
  logoutButton: {
    backgroundColor: colors.danger,
    marginTop: spacing.xl,
    ...shadow.button,
    shadowColor: colors.danger,
  },
  buttonText: {
    color: colors.cardBackground,
    ...typography.h2,
    fontSize: 18,
    fontWeight: 'bold',
  },
  manageProfileButton: {
    width: '100%',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.info,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadow.button,
  },
  manageProfileButtonText: {
    color: colors.cardBackground,
    ...typography.h2,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default HomeScreen;
