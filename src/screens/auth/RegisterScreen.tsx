import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { auth, db } from '../../services/firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc, doc } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, ThemeColors } from '../../context/ThemeContext';

export default function RegisterScreen({ navigation }: any) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { primaryColor, colors } = useTheme();

  const styles = getStyles(colors);

  const handleRegister = async () => {
    if (!nombre || !email || !password) return Alert.alert('Error', 'Todos los campos son obligatorios');
    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, 'users', uid), {
        email: email.trim(),
        nombreApellidos: nombre,
        role: 'user',
        grupos: [],
        fechaCreacion: new Date().toISOString()
      });
    } catch (e: any) {
      Alert.alert('Error al registrar', e.message);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.formContainer}>
        <Text style={styles.title}>Crear Cuenta</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Nombre y Apellidos"
          placeholderTextColor={colors.textDim}
          value={nombre}
          onChangeText={setNombre}
        />
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
        
        <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }]} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrarme</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={styles.backText}>Ya tengo cuenta. <Text style={[styles.backTextBold, { color: primaryColor }]}>Iniciar sesión</Text></Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
  formContainer: { padding: 24, backgroundColor: colors.surface, margin: 16, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 4 },
  title: { fontSize: 32, fontWeight: '900', color: colors.text, marginBottom: 32, textAlign: 'center' },
  input: { backgroundColor: colors.background, color: colors.text, padding: 16, borderRadius: 16, marginBottom: 16, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  button: { padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  backLink: { marginTop: 24, alignItems: 'center' },
  backText: { color: colors.textDim, fontSize: 16 },
  backTextBold: { fontWeight: 'bold' }
});
