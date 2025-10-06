// App.js
// This is the main entry point for your React Native application.
// It sets up the navigation structure and provides authentication context.

import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Text
} from 'react-native';

// Import the AuthContext and AuthProvider from our context folder
import { AuthContext, AuthProvider } from './src/context/AuthContext';

// Import the screen components from our screens folder
import LoginScreen from './src/screens/Auth/LoginScreen';
import RegisterScreen from './src/screens/Auth/RegisterScreen';
import HomeScreen from './src/screens/Home/HomeScreen';
// Make sure these new imports are present!
import ProviderDetailsScreen from './src/screens/Home/ProviderDetailsScreen';
import RiderDetailsScreen from './src/screens/Home/RiderDetailsScreen';
import RidesScreen from './src/screens/Rides/RidesScreen';
import CreateRideScreen from './src/screens/Rides/CreateRideScreen';
import MessagesScreen from './src/screens/Rides/MessagesScreen';
import ProfileScreen from './src/screens/Profile/ProfileScreen';

// Create a stack navigator
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Authentication Stack Navigator: For screens accessible when not logged in
const AuthStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
};

// Main App Tabs: For screens accessible when logged in
const AppTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#007bff',
        tabBarInactiveTintColor: '#8e8e93',
        tabBarStyle: { backgroundColor: '#ffffff' },
        tabBarIcon: ({ color, size }) => {
          let iconName = 'home';
          if (route.name === 'Home') iconName = 'home';
          if (route.name === 'Rides') iconName = 'car';
          if (route.name === 'CreateRide') iconName = 'add-circle';
          if (route.name === 'Profile') iconName = 'person';
          if (route.name === 'Messages') iconName = 'chatbubble';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Rides" component={RidesScreen} />
      <Tab.Screen name="CreateRide" component={CreateRideScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

// Root Navigator: Decides which stack to show based on authentication status
const RootNavigator = () => {
  const { userToken, isLoading } = useContext(AuthContext); // Get userToken and isLoading from AuthContext

  // Show a loading indicator while checking authentication status
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {/* App tabs plus hidden detail screens so navigation.navigate('RiderDetails'/'ProviderDetails') works */}
      {userToken ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={AppTabs} />
          <Stack.Screen name="RiderDetails" component={RiderDetailsScreen} />
          <Stack.Screen name="ProviderDetails" component={ProviderDetailsScreen} />
        </Stack.Navigator>
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
};

// Main App component: Wraps the RootNavigator with AuthProvider
const App = () => {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
});

export default App;
