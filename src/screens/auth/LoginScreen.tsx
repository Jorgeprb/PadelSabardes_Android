import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { auth } from '../../services/firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, ThemeColors } from '../../context/ThemeContext';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { primaryColor, colors } = useTheme();
  
  const styles = getStyles(colors);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Error', 'Completa los campos');
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      Alert.alert('Error al iniciar sesión', e.message);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.formContainer}>
        <Text style={styles.title}>Padel Sabardes</Text>
        <Text style={styles.subtitle}>Inicia sesión para entrar a la pista</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={colors.textDim}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        
        <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }]} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Entrar</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.registerLink}>
          <Text style={styles.registerText}>¿No tienes cuenta? <Text style={[styles.registerTextBold, { color: primaryColor }]}>Regístrate</Text></Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
  formContainer: { padding: 24, backgroundColor: colors.surface, margin: 16, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 4 },
  title: { fontSize: 32, fontWeight: '900', color: colors.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: colors.textDim, marginBottom: 32, textAlign: 'center' },
  input: { backgroundColor: colors.background, color: colors.text, padding: 16, borderRadius: 16, marginBottom: 16, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  button: { padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  registerLink: { marginTop: 24, alignItems: 'center' },
  registerText: { color: colors.textDim, fontSize: 16 },
  registerTextBold: { fontWeight: 'bold' }
});
