// src/screens/Rides/MessagesScreen.js
// Unified messages/requests view for riders and providers

import React, { useContext, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { AuthContext } from '../../context/AuthContext';
import { requestsApi } from '../../utils/api';
import { colors, spacing, borderRadius, typography, shadow } from '../../styles/theme';

const StatusBadge = ({ status }) => {
  const bg = status === 'accepted' ? colors.accent : status === 'pending' ? colors.primary : colors.border;
  const label = status.charAt(0).toUpperCase() + status.slice(1);
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

  const loadRequests = async () => {
    if (!userToken) return;
    try {
      if (userRole === 'provider') {
        const res = await requestsApi.getProviderRequests(userToken);
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
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}> 
          <Text style={styles.title} numberOfLines={1}>{item.startPoint} → {item.destination}</Text>
          {userRole === 'rider' && item.status ? <StatusBadge status={item.status} /> : null}
        </View>
        <Text style={styles.subtitle}>{new Date(item.startTime).toLocaleString()}</Text>
        {userRole === 'provider' ? (
          <>
            <Text style={styles.body}>Rider: {item.rider?.name} ({item.rider?.mobileNumber})</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.accept]} onPress={() => handleAction(item, 'accept')}>
                <Text style={styles.btnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => handleAction(item, 'reject')}>
                <Text style={styles.btnText}>Reject</Text>
              </TouchableOpacity>
            </View>
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
        <TouchableOpacity onPress={onRefresh} style={styles.headerRefresh}> 
          <Text style={styles.headerRefreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
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
  list: { padding: spacing.md },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.default,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.h2, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textPrimary, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  btn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: borderRadius.md, marginLeft: spacing.sm },
  accept: { backgroundColor: colors.accent },
  reject: { backgroundColor: colors.primary },
  btnText: { ...typography.h4, color: colors.cardBackground, fontWeight: 'bold' },
  notifyBox: { marginTop: spacing.md },
  notifyLabel: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs },
  notifyRow: { flexDirection: 'row', alignItems: 'center' },
  notifyInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.md, marginRight: spacing.sm, ...typography.body, color: colors.textPrimary },
  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { ...typography.h2, color: colors.textSecondary },
  emptySubtext: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 },
  badgeText: { ...typography.body, color: colors.cardBackground, fontWeight: '700' },
});

export default MessagesScreen;


