// src/screens/Profile/ProfileScreen.js
import React, { useContext, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
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

  const load = async () => {
    if (!userToken) return;
    setLoading(true);
    try {
      const u = await authApi.getProfile(userToken);
      setUser(u);
      if (userRole === 'provider') {
        try { setDetails(await providerApi.getDetails(userToken)); } catch (_) { setDetails(null); }
      } else if (userRole === 'rider') {
        try { setDetails(await riderApi.getDetails(userToken)); } catch (_) { setDetails(null); }
      }
    } catch (e) {
      setUser(null); setDetails(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userRole]);

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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
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
});

export default ProfileScreen;


