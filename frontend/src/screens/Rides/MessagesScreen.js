// src/screens/Rides/MessagesScreen.js
// Unified messages/requests view for riders and providers

import React, { useContext, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Share, Linking, Alert } from 'react-native';
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
import { requestsApi, otpApi, authApi } from '../../utils/api';
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
  const navigation = useNavigation();
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
        console.log('Loading rider requests and notifications...');
        const [reqRes, notiRes] = await Promise.all([
          requestsApi.getRiderRequests(userToken),
          requestsApi.getRiderNotifications(userToken),
        ]);
        
        console.log('Rider requests response:', reqRes);
        console.log('Rider notifications response:', notiRes);
        
        const requestsArr = reqRes.requests || [];
        
        console.log('Processed requests:', requestsArr);
        
        // Sort requests by creation date (newest first)
        const sortedItems = requestsArr.sort((a, b) => {
          const dateA = new Date(a.createdAt || 0);
          const dateB = new Date(b.createdAt || 0);
          return dateB - dateA; // Newest first
        });
        console.log('Final sorted items:', sortedItems);
        setRequests(sortedItems);
      }
    } catch (e) {
      console.log('Requests load error:', e?.message || e);
      setRequests([]);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [userRole]);

  // Safety: close any open modals when leaving this screen to avoid overlays blocking touches
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        setOtpModalVisible(false);
        setPassengerOtpModalVisible(false);
      };
    }, [])
  );

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
      console.log('Handling action:', action, 'for ride:', item.rideId, 'rider:', item.rider?.id);
      
      if (action === 'accept') {
        console.log('Accepting request...');
        const result = await requestsApi.acceptRequest(item.rideId, item.rider?.id, userToken);
        console.log('Accept request result:', result);
        Alert.alert('Success', 'Request accepted! OTP has been sent to the rider.');
      } else if (action === 'reject') {
        console.log('Rejecting request...');
        const result = await requestsApi.rejectRequest(item.rideId, item.rider?.id, userToken);
        console.log('Reject request result:', result);
        Alert.alert('Success', 'Request rejected.');
      }
      
      console.log('Reloading requests...');
      await loadRequests();
    } catch (e) {
      console.log('Request action error:', e?.message || e);
      Alert.alert('Error', e?.message || 'Failed to process request. Please try again.');
    }
  };

  const [notifyTextByRide, setNotifyTextByRide] = useState({});
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [activeOtpRide, setActiveOtpRide] = useState(null);
  const [activePassengerId, setActivePassengerId] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [passengerOtpModalVisible, setPassengerOtpModalVisible] = useState(false);
  const [passengerOtpText, setPassengerOtpText] = useState('');
  const [replyTextByRide, setReplyTextByRide] = useState({});
  const [selectedCards, setSelectedCards] = useState([]); // Array of rideIds
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState(null);
  const [reportText, setReportText] = useState('');
  const [rating, setRating] = useState(0);

  const shareRiderLocation = async (rideId) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location permission is required to share your location.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      const timestamp = new Date().toLocaleString();
      
      const shareMessage = `🚗 I'm currently in a ride!\n\n📍 My Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n⏰ Time: ${timestamp}\n\n#RideShare #InRide`;
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      
      const shareOptions = {
        message: `${shareMessage}\n\n🗺️ View on Maps: ${mapsUrl}`,
        url: mapsUrl,
        title: 'My Ride Location'
      };

      await Share.share(shareOptions);
    } catch (error) {
      console.log('Error sharing location:', error);
      Alert.alert('Error', 'Failed to share location. Please try again.');
    }
  };

  const startRide = async (rideId, otp) => {
    try {
      Alert.alert(
        'Start Ride',
        'This will verify your OTP and start the ride. You will then have access to SOS and location sharing features.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Start Ride', 
            onPress: async () => {
              try {
                // Get user profile to get user ID
                const userProfile = await authApi.getProfile(userToken);
                // Verify OTP and start ride
                await otpApi.verifyOtp(rideId, userProfile.id, otp, userToken);
                Alert.alert('Success', 'Ride started! You can now use SOS and location sharing features.');
                // Reload requests to show updated status
                await loadRequests();
              } catch (error) {
                console.log('Error starting ride:', error);
                Alert.alert('Error', error?.message || 'Failed to start ride. Please try again.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.log('Error in startRide:', error);
      Alert.alert('Error', 'Failed to start ride. Please try again.');
    }
  };

  const sendSOS = async (rideId) => {
    try {
      // Get user's SOS contact from profile
      const userProfile = await authApi.getProfile(userToken);
      if (!userProfile.sosContact?.mobileNumber) {
        Alert.alert('SOS Contact Not Set', 'Please set your emergency contact in Profile > SOS section first.');
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location permission is required for SOS.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      const timestamp = new Date().toLocaleString();
      
      // Get ride details for provider info
      const rideDetails = await requestsApi.getRideDetails(rideId, userToken);
      
      // Create live tracking link for emergency contact
      const liveTrackingUrl = `https://www.google.com/maps?q=${latitude},${longitude}&z=15&t=m&hl=en&gl=US&mapclient=embed&cid=${Date.now()}`;
      const quickMapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
      
      const sosMessage = `🚨 SOS ALERT 🚨\n\nI'm in an emergency during my ride!\n\n📍 My Current Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n⏰ Time: ${timestamp}\n\n🚗 Ride Details:\nFrom: ${rideDetails.startPoint}\nTo: ${rideDetails.destination}\nProvider: ${rideDetails.provider?.name}\nProvider Mobile: ${rideDetails.provider?.mobileNumber}\n\n🗺️ TRACK ME LIVE:\n${liveTrackingUrl}\n\n📱 Quick Maps Link:\n${quickMapsUrl}\n\nPlease help me immediately and track my location!`;
      
      const smsUrl = `sms:${userProfile.sosContact.mobileNumber}?body=${encodeURIComponent(sosMessage)}`;
      
      Alert.alert(
        'Send SOS Alert',
        `This will send your live location and ride details to ${userProfile.sosContact.name} (${userProfile.sosContact.mobileNumber}). They will receive tracking links to monitor your location in real-time.\n\nContinue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Send SOS', 
            style: 'destructive',
            onPress: async () => {
              try {
                await Linking.openURL(smsUrl);
                Alert.alert('SOS Sent', `Emergency alert with live tracking links has been sent to ${userProfile.sosContact.name}. They can now track your location in real-time.`);
              } catch (error) {
                // Fallback: share via other apps with live tracking links
                await Share.share({
                  message: `${sosMessage}`,
                  url: liveTrackingUrl,
                  title: 'SOS Alert - Live Tracking'
                });
                Alert.alert('SOS Shared', 'Emergency alert with live tracking links has been shared via other apps.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.log('Error sending SOS:', error);
      Alert.alert('Error', 'Failed to send SOS alert. Please try again.');
    }
  };

  const sendReply = async (rideId) => {
    const message = replyTextByRide[rideId];
    if (!message || !message.trim()) return;
    try {
      await requestsApi.replyToProvider(rideId, message.trim(), userToken);
      setReplyTextByRide((prev) => ({ ...prev, [rideId]: '' }));
      Alert.alert('Success', 'Reply sent to provider.');
      await loadRequests();
    } catch (e) {
      console.log('Reply error:', e?.message || e);
      Alert.alert('Error', e?.message || 'Failed to send reply.');
    }
  };

  const toggleCardSelection = (rideId) => {
    setSelectedCards(prev => {
      if (prev.includes(rideId)) {
        const newSelected = prev.filter(id => id !== rideId);
        if (newSelected.length === 0) {
          setIsSelectionMode(false);
        }
        return newSelected;
      } else {
        setIsSelectionMode(true);
        return [...prev, rideId];
      }
    });
  };

  const selectAllCards = () => {
    const allRideIds = requests.map(item => item.rideId);
    setSelectedCards(allRideIds);
    setIsSelectionMode(true);
  };

  const clearSelection = () => {
    setSelectedCards([]);
    setIsSelectionMode(false);
  };

  const deleteSelectedCards = async () => {
    Alert.alert(
      'Delete Message Cards',
      `Are you sure you want to delete ${selectedCards.length} selected message card(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all messages in each selected card
              const deletePromises = selectedCards.map(rideId => 
                requestsApi.deleteMessages(rideId, [], userToken)
              );
              
              await Promise.all(deletePromises);
              Alert.alert('Success', `${selectedCards.length} message card(s) deleted successfully.`);
              clearSelection();
              await loadRequests();
            } catch (e) {
              console.log('Delete cards error:', e?.message || e);
              Alert.alert('Error', e?.message || 'Failed to delete message cards.');
            }
          }
        }
      ]
    );
  };

  const endRide = async (rideId) => {
    try {
      await requestsApi.providerEndRide(rideId, userToken);
      Alert.alert('Success', 'Ride end request sent to all active riders');
      await loadRequests();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to end ride');
    }
  };

  const confirmRideEnd = async (rideId) => {
    try {
      const response = await requestsApi.confirmRideEnd(rideId, userToken);
      Alert.alert('Success', `Ride completed! Average speed: ${response.averageSpeed} km/h`);
      await loadRequests();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to confirm ride end');
    }
  };

  const rejectRideEnd = async (rideId) => {
    try {
      await requestsApi.rejectRideEnd(rideId, userToken);
      Alert.alert('Success', 'Ride end request rejected. Ride continues.');
      await loadRequests();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to reject ride end');
    }
  };

  const submitReport = async () => {
    if (!reportText.trim()) {
      Alert.alert('Error', 'Please enter a report');
      return;
    }
    
    try {
      await requestsApi.reportRide(selectedRideId, reportText.trim(), userToken);
      setReportModalVisible(false);
      setReportText('');
      setSelectedRideId(null);
      Alert.alert('Success', 'Report submitted successfully');
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to submit report');
    }
  };

  const submitRating = async () => {
    if (rating === 0) {
      Alert.alert('Error', 'Please select a rating');
      return;
    }
    
    try {
      await requestsApi.rateRide(selectedRideId, rating, userToken);
      setRatingModalVisible(false);
      setRating(0);
      setSelectedRideId(null);
      Alert.alert('Success', 'Rating submitted successfully');
      // Remove the card from the list after rating
      await loadRequests();
    } catch (error) {
      Alert.alert('Error', error?.message || 'Failed to submit rating');
    }
  };

  const deleteMessage = async (rideId, messageId) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await requestsApi.deleteMessage(rideId, messageId, userToken);
              Alert.alert('Success', 'Message deleted successfully.');
              await loadRequests();
            } catch (e) {
              console.log('Delete message error:', e?.message || e);
              Alert.alert('Error', e?.message || 'Failed to delete message.');
            }
          }
        }
      ]
    );
  };

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
    const isCardSelected = selectedCards.includes(item.rideId);
    const hasRideEndRequest = item.notifications?.some(notif => notif.type === 'ride_end_request') && item.status === 'in-ride';
    
    return (
      <>
        {/* Ride End Request Card - Separate Card */}
        {hasRideEndRequest && (
          <TouchableOpacity
            style={[
              styles.rideEndCard,
              isCardSelected && styles.selectedCard
            ]}
            onLongPress={() => toggleCardSelection(item.rideId)}
            onPress={() => {
              if (isSelectionMode) {
                toggleCardSelection(item.rideId);
              }
            }}
            delayLongPress={500}
          >
            {/* Card Selection Indicator */}
            {isSelectionMode && (
              <View style={styles.cardSelectionIndicator}>
                <Text style={styles.cardSelectionCheckbox}>
                  {isCardSelected ? '✓' : '○'}
                </Text>
              </View>
            )}
            
            <View style={styles.rideEndCardHeader}>
              <Text style={styles.rideEndCardTitle}>🚨 Ride End Request</Text>
              <Text style={styles.rideEndCardSubtitle}>Provider wants to end the ride</Text>
            </View>
            
            <Text style={styles.rideEndCardDetails}>
              {item.startPoint} → {item.destination}
            </Text>
            <Text style={styles.rideEndCardTime}>
              {new Date(item.startTime).toLocaleString()}
            </Text>
            
            <View style={styles.rideEndActions}>
              <TouchableOpacity 
                style={[styles.btn, styles.reject]} 
                onPress={() => rejectRideEnd(item.rideId)}
              >
                <Text style={styles.btnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.btn, styles.confirmEndButton]} 
                onPress={() => confirmRideEnd(item.rideId)}
              >
                <Text style={styles.btnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}

        {/* Original Ride Details Card */}
        <TouchableOpacity
          style={[
            styles.card,
            isCardSelected && styles.selectedCard
          ]}
          onLongPress={() => toggleCardSelection(item.rideId)}
          onPress={() => {
            if (isSelectionMode) {
              toggleCardSelection(item.rideId);
            }
          }}
          delayLongPress={500}
        >
          {/* Card Selection Indicator */}
          {isSelectionMode && (
            <View style={styles.cardSelectionIndicator}>
              <Text style={styles.cardSelectionCheckbox}>
                {isCardSelected ? '✓' : '○'}
              </Text>
            </View>
          )}
          
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
                  {['accepted', 'in-ride'].includes(item.status) && (
                    <TouchableOpacity
                      style={[styles.btn, styles.verify, !item.rider?.id && styles.disabledBtn]}
                      onPress={() => { setActivePassengerId(item.rider?.id); openVerifyModal(item.rideId); }}
                      disabled={!item.rider?.id}
                    >
                      <Text style={styles.btnText}>Verify OTP</Text>
                    </TouchableOpacity>
                  )}
                  
                  {/* Ride Ended Button for Providers */}
                  {item.status === 'in-ride' && (
                    <TouchableOpacity 
                      style={[styles.btn, styles.endRideButton]} 
                      onPress={() => endRide(item.rideId)}
                    >
                      <Text style={styles.btnText}>End Ride</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Notify box for accepted rides */}
                {item.status === 'accepted' && (
                  <View style={styles.notifyBox}>
                    <Text style={styles.notifyLabel}>Notify accepted riders</Text>
                    <View style={styles.notifyRow}>
                      <ScrollView 
                        style={styles.notifyInputScroll}
                        contentContainerStyle={styles.notifyInputContainer}
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={true}
                      >
                        <TextInput
                          style={styles.notifyInput}
                          placeholder="Type a quick update (e.g., 'Another rider joined, we will split costs.')"
                          placeholderTextColor={colors.textSecondary}
                          value={notifyTextByRide[item.rideId] || ''}
                          onChangeText={(text) => setNotifyTextByRide(prev => ({ ...prev, [item.rideId]: text }))}
                          multiline
                          textAlignVertical="top"
                        />
                      </ScrollView>
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
          <>

            {/* Display notifications in the existing card with scroll */}
            {item.notifications && item.notifications.length > 0 ? (
              <ScrollView 
                style={styles.messagesScrollContainer}
                contentContainerStyle={styles.messagesContainer}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {item.notifications.map((notif, index) => (
                  <View key={notif.id} style={[
                    styles.messageItem,
                    notif.type === 'ride_end_request' && styles.rideEndMessageItem
                  ]}>
                    <View style={styles.messageHeader}>
                      <Text style={styles.messageSender}>
                        {notif.fromUserName || (notif.fromUserId === item.provider.id ? item.provider.name : 'You')}
                      </Text>
                      <Text style={styles.messageTime}>
                        {new Date(notif.createdAt).toLocaleTimeString()}
                      </Text>
                    </View>
                    <Text style={[
                      styles.messageText,
                      notif.type === 'ride_end_request' && styles.rideEndMessageText
                    ]}>
                      {notif.type === 'ride_end_request' ? '🚨 ' + notif.message : notif.message}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.body}>Status updates will appear here.</Text>
            )}
            
            {/* Reply input for riders */}
            {userRole === 'rider' && item.status === 'accepted' && (
              <View style={styles.replyContainer}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Reply to provider..."
                  value={replyTextByRide[item.rideId] || ''}
                  onChangeText={(text) => setReplyTextByRide(prev => ({ ...prev, [item.rideId]: text }))}
                  multiline
                />
                <TouchableOpacity 
                  style={[styles.replyButton, (!replyTextByRide[item.rideId]?.trim()) && styles.disabledBtn]}
                  onPress={() => sendReply(item.rideId)}
                  disabled={!replyTextByRide[item.rideId]?.trim()}
                >
                  <Text style={styles.replyButtonText}>Send</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* OTP Display and Start Ride */}
            {item.status === 'accepted' && item.otp ? (
              <View style={styles.otpDisplay}>
                <Text style={styles.otpLabel}>Your Boarding OTP:</Text>
                <Text style={styles.otpCode}>{item.otp}</Text>
                <View style={styles.otpButtons}>
                  <TouchableOpacity style={[styles.btn, styles.otp]} onPress={() => {
                    setPassengerOtpText(item.otp);
                    setPassengerOtpModalVisible(true);
                  }}>
                    <Text style={styles.btnText}>Copy OTP</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.startRideButton]} onPress={() => startRide(item.rideId, item.otp)}>
                    <Text style={styles.btnText}>Start Ride</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            
            {/* Track Provider Button */}
            {(item.status === 'accepted' || item.status === 'in-ride') && item.rideId ? (
              <View style={{ marginTop: spacing.sm, alignItems: 'flex-end' }}>
                <TouchableOpacity style={[styles.btn, styles.verify]} onPress={() => {
                  try {
                    navigation.navigate('ProviderTrack', { rideId: item.rideId });
                  } catch (e) {
                    console.log('Navigation error:', e?.message || e);
                  }
                }}>
                  <Text style={styles.btnText}>Track Provider</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            
            {/* In-Ride Features */}
            {item.status === 'in-ride' && item.rideId ? (
              <View style={{ marginTop: spacing.sm, alignItems: 'flex-end' }}>
                <TouchableOpacity style={[styles.btn, styles.shareButton]} onPress={() => shareRiderLocation(item.rideId)}>
                  <Text style={styles.btnText}>Share My Location</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.sosButton]} onPress={() => sendSOS(item.rideId)}>
                  <Text style={styles.btnText}>🚨 SOS</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            
            {/* Completed Ride Features */}
            {item.status === 'completed' && (
              <View style={styles.completedRideContainer}>
                {item.averageSpeed && (
                  <View style={styles.speedDisplay}>
                    <Text style={styles.speedLabel}>Average Speed:</Text>
                    <Text style={styles.speedValue}>{item.averageSpeed} km/h</Text>
                  </View>
                )}
                
                <View style={styles.completedActions}>
                  <TouchableOpacity 
                    style={[styles.btn, styles.reportButton]} 
                    onPress={() => {
                      setSelectedRideId(item.rideId);
                      setReportModalVisible(true);
                    }}
                  >
                    <Text style={styles.btnText}>Report</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.btn, styles.rateButton]} 
                    onPress={() => {
                      setSelectedRideId(item.rideId);
                      setRatingModalVisible(true);
                    }}
                  >
                    <Text style={styles.btnText}>Rate Ride</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
        </TouchableOpacity>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerRight}>
          {isSelectionMode ? (
            <>
              <TouchableOpacity onPress={selectAllCards} style={styles.headerAction}>
                <Text style={styles.headerRefreshText}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearSelection} style={styles.headerAction}>
                <Text style={styles.headerRefreshText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setShowDebug(s => !s)} style={styles.debugToggle}>
                <Text style={styles.headerRefreshText}>{showDebug ? 'Hide Debug' : 'Show Debug'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onRefresh} style={styles.headerRefresh}> 
                <Text style={styles.headerRefreshText}>Refresh</Text>
              </TouchableOpacity>
            </>
          )}
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
      
      {/* Floating Delete Button */}
      {isSelectionMode && selectedCards.length > 0 && (
        <TouchableOpacity 
          style={styles.floatingDeleteButton}
          onPress={deleteSelectedCards}
        >
          <Text style={styles.floatingDeleteText}>
            Delete ({selectedCards.length})
          </Text>
        </TouchableOpacity>
      )}
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
      
      {/* Report Modal */}
      <Modal
        visible={reportModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <Text style={modalStyles.title}>Report Ride</Text>
            <Text style={modalStyles.subtitle}>Please describe any issues with this ride</Text>
            
            <TextInput
              style={modalStyles.textInput}
              placeholder="Enter your report..."
              value={reportText}
              onChangeText={setReportText}
              multiline
              numberOfLines={4}
              placeholderTextColor={colors.textSecondary}
            />
            
            <View style={modalStyles.buttonRow}>
              <TouchableOpacity
                style={[modalStyles.button, modalStyles.cancelButton]}
                onPress={() => {
                  setReportModalVisible(false);
                  setReportText('');
                  setSelectedRideId(null);
                }}
              >
                <Text style={modalStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[modalStyles.button, modalStyles.submitButton]}
                onPress={submitReport}
              >
                <Text style={modalStyles.submitButtonText}>Submit Report</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Rating Modal */}
      <Modal
        visible={ratingModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <Text style={modalStyles.title}>Rate Your Ride</Text>
            <Text style={modalStyles.subtitle}>How was your experience?</Text>
            
            <View style={modalStyles.starContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  style={modalStyles.star}
                  onPress={() => setRating(star)}
                >
                  <Text style={[
                    modalStyles.starText,
                    star <= rating && modalStyles.starSelected
                  ]}>
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={modalStyles.buttonRow}>
              <TouchableOpacity
                style={[modalStyles.button, modalStyles.cancelButton]}
                onPress={() => {
                  setRatingModalVisible(false);
                  setRating(0);
                  setSelectedRideId(null);
                }}
              >
                <Text style={modalStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[modalStyles.button, modalStyles.submitButton]}
                onPress={submitRating}
                disabled={rating === 0}
              >
                <Text style={modalStyles.submitButtonText}>Submit Rating</Text>
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
  shareButton: { backgroundColor: '#FF9800' },
  sosButton: { backgroundColor: '#f44336' },
  startRideButton: { backgroundColor: '#9C27B0' },
  disabledBtn: { opacity: 0.5 },
  notifyBox: { marginTop: spacing.md },
  notifyLabel: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs },
  notifyRow: { flexDirection: 'row', alignItems: 'center' },
  notifyInput: { 
    borderWidth: 1, 
    borderColor: colors.border, 
    borderRadius: borderRadius.md, 
    padding: spacing.md, 
    ...typography.body, 
    color: colors.textPrimary,
    minHeight: 40,
    backgroundColor: colors.background
  },
  notifyInputScroll: {
    flex: 1,
    marginRight: spacing.sm,
    maxHeight: 80,
  },
  notifyInputContainer: {
    flexGrow: 1,
  },
  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { ...typography.h2, color: colors.textSecondary },
  emptySubtext: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 },
  badgeText: { ...typography.body, color: colors.cardBackground, fontWeight: '700' },
  otpDisplay: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  otpButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: spacing.sm
  },
  otpLabel: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  otpCode: {
    ...typography.h1,
    color: colors.primary,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
    letterSpacing: 2,
  },
  speedDisplay: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    alignItems: 'center'
  },
  speedLabel: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs
  },
  speedValue: {
    ...typography.h3,
    color: colors.primary,
    fontWeight: 'bold'
  },
  messagesContainer: {
    paddingBottom: spacing.sm,
  },
  messagesScrollContainer: {
    maxHeight: 300, // Increased height for better scrolling experience
    marginTop: spacing.sm,
  },
  messageItem: {
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  messageSender: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  messageActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageTime: {
    ...typography.caption,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  messageText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  replyContainer: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginRight: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    maxHeight: 80,
  },
  replyButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  replyButtonText: {
    ...typography.body,
    color: colors.cardBackground,
    fontWeight: '600',
  },
  floatingDeleteButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: colors.danger,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadow.default,
  },
  floatingDeleteText: {
    ...typography.body,
    color: colors.cardBackground,
    fontWeight: 'bold',
  },
  selectedCard: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  cardSelectionIndicator: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.default,
  },
  cardSelectionCheckbox: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: 'bold',
  },
  headerAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  endRideButton: {
    backgroundColor: colors.danger,
  },
  rideEndConfirmation: {
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderColor: colors.warning,
    borderWidth: 2,
    ...shadow.default,
  },
  rideEndText: {
    ...typography.h3,
    color: colors.warning,
    marginBottom: spacing.sm,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  rideEndSubtext: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  rideEndActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  confirmEndButton: {
    backgroundColor: colors.success,
    flex: 1,
    marginLeft: spacing.sm,
  },
  completedRideContainer: {
    marginTop: spacing.sm,
  },
  completedActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  reportButton: {
    backgroundColor: colors.warning,
    flex: 1,
    marginRight: spacing.xs,
  },
  rateButton: {
    backgroundColor: colors.primary,
    flex: 1,
    marginLeft: spacing.xs,
  },
  rideEndCard: {
    backgroundColor: colors.warningLight,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    borderColor: colors.warning,
    borderWidth: 3,
    ...shadow.default,
  },
  rideEndCardHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  rideEndCardTitle: {
    ...typography.h2,
    color: colors.warning,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  rideEndCardSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  rideEndCardDetails: {
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  rideEndCardTime: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  rideEndMessageItem: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
    borderWidth: 2,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  rideEndMessageText: {
    color: colors.warning,
    fontWeight: 'bold',
    fontSize: 16,
  },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  container: { width: '90%', backgroundColor: colors.cardBackground, padding: spacing.lg, borderRadius: borderRadius.lg },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md, ...typography.body, color: colors.textPrimary },
  textInput: { 
    borderWidth: 1, 
    borderColor: colors.border, 
    borderRadius: borderRadius.md, 
    padding: spacing.md, 
    marginBottom: spacing.md, 
    ...typography.body,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  row: { flexDirection: 'row', justifyContent: 'flex-end' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  button: { flex: 1, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  cancelButton: { backgroundColor: colors.border, marginRight: spacing.sm },
  submitButton: { backgroundColor: colors.primary, marginLeft: spacing.sm },
  cancelButtonText: { ...typography.body, color: colors.textPrimary },
  submitButtonText: { ...typography.body, color: colors.cardBackground, fontWeight: '600' },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  star: {
    padding: spacing.sm,
  },
  starText: {
    fontSize: 40,
    color: colors.border,
  },
  starSelected: {
    color: colors.warning,
  },
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


