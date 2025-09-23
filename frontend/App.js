// App.js
// This is the main entry point for your React Native application.
// It sets up the navigation structure and provides authentication context.

import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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

// Create a stack navigator
const Stack = createNativeStackNavigator();

// Authentication Stack Navigator: For screens accessible when not logged in
const AuthStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
};

// Main App Stack Navigator: For screens accessible when logged in
const AppStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      {/* THESE ARE THE SCREENS THAT NEED TO BE INCLUDED */}
      <Stack.Screen name="ProviderDetails" component={ProviderDetailsScreen} />
      <Stack.Screen name="RiderDetails" component={RiderDetailsScreen} />
      <Stack.Screen name="Rides" component={RidesScreen} />
      <Stack.Screen name="CreateRide" component={CreateRideScreen} />
    </Stack.Navigator>
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
      {/* If userToken exists, show the main app stack, otherwise show the authentication stack */}
      {userToken ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

//  Main App component: Wraps the RootNavigator with AuthProvider
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
