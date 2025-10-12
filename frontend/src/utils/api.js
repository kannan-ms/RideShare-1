// src/utils/api.js
// Centralized API utility for making requests to the backend.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOOGLE_MAPS_API_KEY } from '../config/googleMapsConfig';

// --- API Base URL ---
// IMPORTANT: Adjust this based on your development environment.
// - For Android Emulator: 'http://10.0.2.2:5000/api'
// - For Physical Android Device: 'http://YOUR_LOCAL_IP_ADDRESS:5000/api' (e.g., 'http://192.168.1.100:5000/api')
// - For iOS Simulator/Device: 'http://localhost:5000/api' (or your local IP)
// - For Web (if you ever build a web version with Expo): 'http://localhost:5000/api'

const API_BASE_URL = 'http://192.168.29.117:5000/api'; // Default for Android Emulator

// Generic function to make API calls
export const apiCall = async (endpoint, method = 'GET', data = null, token = null) => {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add authorization token if provided
  if (token) {
    headers['x-auth-token'] = token;
  }

  const config = {
    method,
    headers,
  };

  // Add request body for POST/PUT methods
  if (data) {
    config.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const contentType = response.headers.get('content-type');
    let responseData;
    try {
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        const textResponse = await response.text();
        console.error('Non-JSON response received:', textResponse.substring(0, 200));
        if (response.status >= 400) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}. Please check if the backend server is running.`);
        } else {
          throw new Error('Server returned an invalid response format. Please try again.');
        }
      }
    } catch (parseError) {
      console.error('Response parsing error:', parseError);
      if (response.status >= 400) {
        throw new Error(`Server error (${response.status}): Unable to parse response. Please check if the backend server is running.`);
      } else {
        throw new Error('Invalid response from server. Please try again.');
      }
    }

    if (!response.ok) {
      // For 404, return a normalized object so caller can handle missing resources gracefully
      if (response.status === 404) {
        return { status: 404, message: responseData?.message || 'Resource not found.' };
      }
      // Handle specific error cases
      if (response.status === 401) {
        throw new Error('Token is invalid or expired. Please login again.');
      } else if (response.status === 403) {
        throw new Error('Access denied. Please check your permissions.');
      } else if (response.status >= 500) {
        throw new Error('Server error. Please try again later.');
      } else {
        throw new Error(responseData?.message || `Request failed with status ${response.status}`);
      }
    }

    return responseData;
  } catch (error) {
    console.error(`API Call Error (${endpoint}):`, error.message);

    if (error.message.includes('Token is invalid') || error.message.includes('expired')) {
      try {
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('userRole');
      } catch (storageError) {
        console.error('Failed to clear invalid token:', storageError);
      }
    }

    throw error;
  }
};

// Auth API functions
export const authApi = {
  register: (userData) => apiCall('/auth/register', 'POST', userData),
  login: (credentials) => apiCall('/auth/login', 'POST', credentials),
  getProfile: (token) => apiCall('/auth/me', 'GET', null, token),
  updateRole: (role, token) => apiCall('/auth/role', 'PUT', { role }, token),
};

// MODIFIED: Ensure these are correctly exported
export const providerApi = {
  saveDetails: (details, token) => apiCall('/provider/details', 'POST', details, token),
  getDetails: (token) => apiCall('/provider/details', 'GET', null, token),
  getPublicByUserId: (userId, token) => apiCall(`/provider/public/${userId}`, 'GET', null, token),
};

// MODIFIED: Ensure these are correctly exported
export const riderApi = {
  saveDetails: (details, token) => apiCall('/rider/details', 'POST', details, token),
  getDetails: (token) => apiCall('/rider/details', 'GET', null, token),
};

// Ride API functions
export const rideApi = {
  createRide: (rideData, token) => apiCall('/ride', 'POST', rideData, token),
  getAvailableRides: (token) => apiCall('/rides', 'GET', null, token),
  getProviderRides: (token) => apiCall('/provider/rides', 'GET', null, token),
  bookRide: (rideId, token) => apiCall(`/rides/book/${rideId}`, 'POST', null, token),
  deleteRide: (rideId, token) => apiCall(`/provider/rides/${rideId}`, 'DELETE', null, token),
};

// OCR API
export const ocrApi = {
  extractText: (imageBase64, token) => apiCall('/ocr/extract', 'POST', { imageBase64 }, token),
};

// Requests/Messaging-style APIs
export const requestsApi = {
  getProviderRequests: (token) => apiCall('/provider/requests', 'GET', null, token),
  acceptRequest: (rideId, riderId, token) => apiCall(`/provider/requests/${rideId}/${riderId}/accept`, 'POST', null, token),
  rejectRequest: (rideId, riderId, token) => apiCall(`/provider/requests/${rideId}/${riderId}/reject`, 'POST', null, token),
  getRiderRequests: (token) => apiCall('/rider/requests', 'GET', null, token),
  notifyAccepted: (rideId, message, token, toAllAccepted = true) => apiCall(`/provider/notify/${rideId}`, 'POST', { message, toAllAccepted }, token),
  getRiderNotifications: (token) => apiCall('/rider/notifications', 'GET', null, token),
};

// OTP APIs
export const otpApi = {
  verifyOtp: (rideId, passengerId, otp, token) => apiCall('/otp/verify', 'POST', { rideId, passengerId, otp }, token),
};

// --- Google Maps Helpers ---
// Reverse geocode coordinates to a human-readable address
export const getFormattedAddress = async (point) => {
  try {
    let latitude = null;
    let longitude = null;
    if (typeof point === 'string') {
      const match = point.match(/\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if (match) {
        latitude = parseFloat(match[1]);
        longitude = parseFloat(match[2]);
      }
    } else if (point && typeof point === 'object') {
      if (typeof point.latitude === 'number' && typeof point.longitude === 'number') {
        latitude = point.latitude;
        longitude = point.longitude;
      }
    }

    if (latitude == null || longitude == null) return null;
    if (!GOOGLE_MAPS_API_KEY) return null;

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.results?.length) {
      return data.results[0].formatted_address;
    }
    return null;
  } catch (e) {
    console.log('getFormattedAddress error:', e?.message || e);
    return null;
  }
};

