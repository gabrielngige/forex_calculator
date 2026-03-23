import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'http://localhost:3000/api'; // Adjust for your server

export default function App() {
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rate, setRate] = useState(null);

  useEffect(() => {
    const loadToken = async () => {
      const stored = await AsyncStorage.getItem('token');
      if (stored) setToken(stored);
    };
    loadToken();
  }, []);

  const login = async () => {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        await AsyncStorage.setItem('token', data.token);
      } else {
        Alert.alert('Error', data.error);
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const register = async () => {
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      Alert.alert('Info', data.message || data.error);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const fetchRate = async () => {
    try {
      const res = await fetch(`${API_BASE}/rate/USD/EUR`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setRate(data.rate);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const logout = async () => {
    setToken('');
    await AsyncStorage.removeItem('token');
  };

  if (!token) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Login to OPP Forex</Text>
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Button title="Login" onPress={login} />
        <Button title="Register" onPress={register} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OPP Forex Calculator</Text>
      <Button title="Logout" onPress={logout} />
      <Button title="Fetch USD/EUR Rate" onPress={fetchRate} />
      {rate && <Text>Rate: {rate}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, padding: 10, marginBottom: 10 },
});