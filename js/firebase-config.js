const firebaseConfig = {
  apiKey: "AIzaSyBYnLfSIALpP7z7d44h8pQFJMPyNGq01Tg",
  authDomain: "damnstraightbc.firebaseapp.com",
  projectId: "damnstraightbc",
  storageBucket: "damnstraightbc.firebasestorage.app",
  messagingSenderId: "79398652638",
  appId: "1:79398652638:web:faed0ef2e961ccad07104f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();