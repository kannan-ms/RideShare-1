// src/screens/Rides/MessagesScreen.js
// Unified messages/requests view for riders and providers

import React, { useContext, useEffect, useState } from 'react';
// NOTE: Some native modules can cause the app to crash at load time if the
// installed native version doesn't match the Expo Go client. To avoid that
// bringing down the whole app during development, we require `expo-clipboard`
// at runtime in a guarded way and provide a graceful fallback.

let _clipboardModule = null;
const getClipboard = () => {
  if (_clipboardModule) return _clipboardModule;
  try {
    //
    // runtime require is safer than a static import here
    // because static imports run during module evaluation and can fail
    // when native code is missing or incompatible.
    // eslint-disable-next-line global-require
    _clipboardModule = require('expo-clipboard');
    return _clipboardModule;
  } catch (err) {
    console.warn('expo-clipboard not available or failed to load:', err?.message || err);
    _clipboardModule = null;
    return null;
  }
};
import { SafeAreaView, StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl, TextInput, Modal, ScrollView } from 'react-native';
import { AuthContext } from '../../context/AuthContext';
import { requestsApi } from '../../utils/api';
import { otpApi } from '../../utils/api';
import { colors, spacing, borderRadius, typography, shadow } from '../../styles/theme';

const StatusBadge = ({ status }) => {
  let bg = colors.border;
  if (status === 'accepted') bg = colors.accent; // green
  else if (status === 'pending') bg = colors.primary; // blue
  else if (status === 'in-ride') bg = '#6c757d'; // muted grey
  else if (status === 'started') bg = '#4a148c'; // deep purple
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
};

const MessagesScreen = () => {
  const { userToken, userRole } = useContext(AuthContext);
  const [requests, setRequests] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [rawResponse, setRawResponse] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  const loadRequests = async () => {
    if (!userToken) return;
    try {
      if (userRole === 'provider') {
        const res = await requestsApi.getProviderRequests(userToken);
        console.debug('Provider requests raw response:', res);
        setRawResponse(res);
        setRequests(res.requests || []);
      } else if (userRole === 'rider') {
        const [reqRes, notiRes] = await Promise.all([
          requestsApi.getRiderRequests(userToken),
          requestsApi.getRiderNotifications(userToken),
        ]);
        const requestsArr = reqRes.requests || [];
        const notificationsArr = (notiRes.notifications || []).map(n => ({
          isNotification: true,
          rideId: n.rideId,
          message: n.message,
          createdAt: n.createdAt,
        }));
        // Merge notifications at top
        setRequests([...notificationsArr, ...requestsArr]);
      }
    } catch (e) {
      console.log('Requests load error:', e?.message || e);
      setRequests([]);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [userRole]);

  // Polling: refresh provider requests periodically so UI reflects changes initiated by rider actions (e.g., OTP verified)
  useEffect(() => {
    if (userRole !== 'provider') return undefined;
    let mounted = true;
    const interval = setInterval(async () => {
      if (!mounted) return;
      try {
        await loadRequests();
      } catch (e) {
        // ignore polling errors
      }
    }, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [userRole]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const handleAction = async (item, action) => {
    try {
      if (userRole !== 'provider') return;
      if (action === 'accept') {
        await requestsApi.acceptRequest(item.rideId, item.rider?.id, userToken);
      } else if (action === 'reject') {
        await requestsApi.rejectRequest(item.rideId, item.rider?.id, userToken);
      }
      await loadRequests();
    } catch (e) {
      console.log('Request action error:', e?.message || e);
    }
  };

  const [notifyTextByRide, setNotifyTextByRide] = useState({});
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [activeOtpRide, setActiveOtpRide] = useState(null);
  const [activePassengerId, setActivePassengerId] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [passengerOtpModalVisible, setPassengerOtpModalVisible] = useState(false);
  const [passengerOtpText, setPassengerOtpText] = useState('');

  const sendNotify = async (rideId) => {
    const message = notifyTextByRide[rideId];
    if (!message || !message.trim()) return;
    try {
      await requestsApi.notifyAccepted(rideId, message.trim(), userToken, true);
      setNotifyTextByRide((prev) => ({ ...prev, [rideId]: '' }));
      await loadRequests();
    } catch (e) {
      console.log('Notify send error:', e?.message || e);
    }
  };

  // Manual OTP generation is intentionally disabled because OTPs are generated automatically when a provider accepts a request.

  const openVerifyModal = (rideId) => {
    setActiveOtpRide(rideId);
    setOtpModalVisible(true);
    setOtpInput('');
  };

  const handleVerifyOtp = async () => {
    if (!activeOtpRide || !otpInput) return;
    try {
      // Use the passenger id that was captured when opening the modal
      const passengerId = activePassengerId;
      if (!passengerId) {
        alert('Passenger id not found for this ride. Please open Verify from the rider card.');
        return;
      }
      if (!/^[0-9]{4}$/.test(otpInput)) {
        alert('Please enter a 4-digit numeric OTP.');
        return;
      }
      await otpApi.verifyOtp(activeOtpRide, passengerId, otpInput, userToken);
      alert('OTP verified — passenger marked as boarded.');
      setOtpModalVisible(false);
      setOtpInput('');
      await loadRequests();
    } catch (e) {
      console.log('Verify OTP error:', e?.message || e);
      alert('OTP verification failed: ' + (e?.message || 'Unknown error'));
    }
  };

  const renderItem = ({ item }) => {
    if (item.isNotification) {
      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}> 
            <Text style={styles.title} numberOfLines={1}>Ride Update</Text>
            <StatusBadge status={'accepted'} />
          </View>
          <Text style={styles.subtitle}>{new Date(item.createdAt).toLocaleString()}</Text>
          <Text style={styles.body}>{item.message}</Text>
          {userRole === 'rider' && /Your boarding OTP is:\s*(\d{4})/.test(item.message) ? (
            <View style={{ marginTop: spacing.sm, alignItems: 'flex-end' }}>
              <TouchableOpacity style={[styles.btn, styles.otp]} onPress={() => {
                const m = item.message.match(/Your boarding OTP is:\s*(\d{4})/);
                if (m) {
                  setPassengerOtpText(m[1]);
                  setPassengerOtpModalVisible(true);
                }
              }}>
                <Text style={styles.btnText}>Show OTP</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}> 
          <Text style={styles.title} numberOfLines={1}>{item.startPoint} → {item.destination}</Text>
          {item.status ? <StatusBadge status={item.status} /> : null}
        </View>
        <Text style={styles.subtitle}>{new Date(item.startTime).toLocaleString()}</Text>
        {userRole === 'provider' ? (
          <>
            <Text style={styles.body}>Rider: {item.rider?.name} ({item.rider?.mobileNumber})</Text>

            {/* Pending requests: show Accept / Reject */}
            {item.status === 'pending' ? (
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.btn, styles.accept]} onPress={() => handleAction(item, 'accept')}>
                  <Text style={styles.btnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => handleAction(item, 'reject')}>
                  <Text style={styles.btnText}>Reject</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Accepted requests: show OTP controls and notify box */}
            {(['accepted','in-ride','started'].includes(item.status)) ? (
              <>
                <View style={styles.actions}>
                  {/* Show Generate only when the request is freshly accepted */}
                  {/* Allow Verify for accepted or in-ride (provider can verify boarding) */}
                  {['accepted', 'in-ride'].includes(item.status) && (
                    <TouchableOpacity
                      style={[styles.btn, styles.verify, !item.rider?.id && styles.disabledBtn]}
                      onPress={() => { setActivePassengerId(item.rider?.id); openVerifyModal(item.rideId); }}
                      disabled={!item.rider?.id}
                    >
                      <Text style={styles.btnText}>Verify OTP</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Only show notify box when the request is in accepted state */}
                {item.status === 'accepted' && (
                  <View style={styles.notifyBox}>
                    <Text style={styles.notifyLabel}>Notify accepted riders</Text>
                    <View style={styles.notifyRow}>
                      <TextInput
                        style={styles.notifyInput}
                        placeholder="Type a quick update (e.g., 'Another rider joined, we will split costs.')"
                        placeholderTextColor={colors.textSecondary}
                        value={notifyTextByRide[item.rideId] || ''}
                        onChangeText={(text) => setNotifyTextByRide(prev => ({ ...prev, [item.rideId]: text }))}
                        multiline
                      />
                      <TouchableOpacity style={[styles.btn, styles.accept]} onPress={() => sendNotify(item.rideId)}>
                        <Text style={styles.btnText}>Send</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            ) : null}
          </>
        ) : (
          <Text style={styles.body}>Status updates will appear here.</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setShowDebug(s => !s)} style={styles.debugToggle}>
            <Text style={styles.headerRefreshText}>{showDebug ? 'Hide Debug' : 'Show Debug'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRefresh} style={styles.headerRefresh}> 
            <Text style={styles.headerRefreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
      {showDebug && (
        <View style={styles.debugBox}>
          <Text style={styles.debugLabel}>Provider requests raw response (tap Refresh to update):</Text>
          <ScrollView style={styles.debugScroll}>
            <Text style={styles.debugText}>{rawResponse ? JSON.stringify(rawResponse, null, 2) : 'no response yet'}</Text>
          </ScrollView>
        </View>
      )}
      <FlatList
        contentContainerStyle={styles.list}
        data={requests}
        keyExtractor={(item, idx) => `${item.rideId}-${idx}`}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}> 
            <Text style={styles.emptyText}>No requests yet</Text>
            <Text style={styles.emptySubtext}>{userRole === 'provider' ? 'Riders will appear here when they request your ride.' : 'Your booking requests will show here.'}</Text>
          </View>
        }
      />
      {/* OTP Verification Modal */}
      <Modal
        visible={otpModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setOtpModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <Text style={modalStyles.title}>Verify OTP</Text>
            <Text style={modalStyles.subtitle}>Enter the 4-digit OTP shown to the passenger</Text>
            <TextInput
              style={modalStyles.input}
              value={otpInput}
              onChangeText={setOtpInput}
              placeholder="Enter OTP"
              keyboardType="numeric"
              maxLength={4}
            />
            <View style={modalStyles.row}>
              <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => setOtpModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.verify]} onPress={handleVerifyOtp}>
                <Text style={styles.btnText}>Verify</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Passenger OTP reveal modal */}
      <Modal
        visible={passengerOtpModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPassengerOtpModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <Text style={modalStyles.title}>Your Boarding OTP</Text>
            <Text style={modalStyles.subtitle}>Show this code to the provider when boarding</Text>
            <View style={{ padding: spacing.md, alignItems: 'center' }}>
              <Text style={{ ...typography.h1, color: colors.textPrimary }}>{passengerOtpText}</Text>
            </View>
            <View style={modalStyles.row}>
                <TouchableOpacity style={[styles.btn, styles.verify]} onPress={async () => {
                  try {
                    const clip = getClipboard();
                    if (clip && typeof clip.setStringAsync === 'function') {
                      await clip.setStringAsync(passengerOtpText || '');
                      alert('OTP copied to clipboard');
                    } else {
                      // Graceful fallback: copy not supported in this environment
                      alert('Copy to clipboard is not supported in this environment. Please long-press the code to copy.');
                    }
                  } catch (err) {
                    console.log('Clipboard copy failed:', err);
                    alert('Unable to copy OTP to clipboard');
                  }
                }}>
                  <Text style={styles.btnText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => setPassengerOtpModalVisible(false)}>
                  <Text style={styles.btnText}>Close</Text>
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
  headerBar: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { ...typography.h2, color: colors.cardBackground },
  headerRefresh: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.primaryLight, borderRadius: borderRadius.sm },
  headerRefreshText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  debugToggle: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, marginRight: spacing.sm },
  debugBox: { backgroundColor: '#111', padding: spacing.md, margin: spacing.md, borderRadius: borderRadius.md },
  debugLabel: { color: '#fff', marginBottom: spacing.xs },
  debugScroll: { maxHeight: 200 },
  debugText: { color: '#ddd', fontSize: 12 },
  list: { padding: spacing.md },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm * 1.2,
    ...shadow.default,
    paddingBottom: spacing.lg,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.h3, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs },
  body: { ...typography.body, color: colors.textPrimary, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm },
  // Standard button style for action buttons in message cards
  btn: { 
    paddingVertical: spacing.sm * 0.9, 
    paddingHorizontal: spacing.md, 
    borderRadius: borderRadius.md, 
    marginLeft: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  accept: { backgroundColor: colors.accent },
  reject: { backgroundColor: colors.primary },
  btnText: { ...typography.h4, color: colors.cardBackground, fontWeight: 'bold' },
  otp: { backgroundColor: '#4CAF50' },
  verify: { backgroundColor: '#2196F3' },
  disabledBtn: { opacity: 0.5 },
  notifyBox: { marginTop: spacing.md },
  notifyLabel: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs },
  notifyRow: { flexDirection: 'row', alignItems: 'center' },
  notifyInput: { 
    flex: 1, 
    borderWidth: 1, 
    borderColor: colors.border, 
    borderRadius: borderRadius.md, 
    padding: spacing.md, 
    marginRight: spacing.sm, 
    ...typography.body, 
    color: colors.textPrimary,
    minHeight: 60,
    backgroundColor: colors.background
  },
  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { ...typography.h2, color: colors.textSecondary },
  emptySubtext: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 },
  badgeText: { ...typography.body, color: colors.cardBackground, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  container: { width: '90%', backgroundColor: colors.cardBackground, padding: spacing.lg, borderRadius: borderRadius.lg },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md, ...typography.body, color: colors.textPrimary },
  row: { flexDirection: 'row', justifyContent: 'flex-end' },
});

export default MessagesScreen;

// OTP Modal component (rendered adjacent to the screen root via state)
// We'll keep markup simple and inline when the modal state is true
// Insert modal just before export if visible
/* Note: React Native modal is rendered by the component using state; here it's placed in this file's return.
  But to avoid editing the return structure heavily, the MessagesScreen component already holds modal state.
  The modal will be rendered by MessagesScreen via the state `otpModalVisible`.
*/


// OTP Modal styles and modal component


