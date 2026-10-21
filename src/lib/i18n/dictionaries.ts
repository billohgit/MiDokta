/** UI text in each supported language. `en` is the source; `fr` must have exactly the same keys. */

import type { SIGNUP_ROLES } from "@/lib/roles";

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

/** Each language named in itself, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", fr: "Français" };

/** For Intl date and number formatting. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", fr: "fr-FR" };

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

const en = {
  nav: {
    dashboard: "Dashboard",
    home: "Home",
    appointments: "Appointments",
    patients: "Patients",
    doctors: "Doctors",
    staff: "Staff",
    verification: "Verification",
    hospitals: "Hospitals",
    pharmacy: "Pharmacy",
    billing: "Billing",
    billsPayments: "Bills & Payments",
    chat: "Chat",
    messages: "Messages",
    sms: "SMS",
    settings: "Settings",
    videoCalls: "Video Calls",
    myRecords: "My Records",
    myProfile: "My Profile",
    schedule: "Schedule",
    prescriptions: "Prescriptions",
    stock: "Stock",
  },
  topbar: {
    toggleSidebar: "Toggle sidebar",
    language: "Language",
    accountSettings: "Account settings",
    signOut: "Sign out",
  },
  login: {
    welcome: "Welcome back",
    subtitle: "Sign in to your account",
    iAmA: "I am a",
    patient: "Patient",
    doctorStaff: "Doctor / Staff",
    signInWith: "Sign in with",
    email: "Email",
    phone: "Phone",
    phoneNumber: "Phone number",
    password: "Password",
    signIn: "Sign In",
    signingIn: "Signing in...",
    noAccount: "Don't have an account?",
    createOne: "Create one",
    noPasswordYet: "No password yet? Sign in with your phone, then set one in Settings.",
    sharedNumber: "This number is shared by more than one patient. Who is signing in?",
    differentNumber: "Use a different number",
    enterCode: "Enter the code we texted to you.",
    code: "6-digit code",
    checking: "Checking...",
    newCode: "Send a new code",
    changeNumber: "Change number",
    clinicNumber: "Use the number the clinic has for you. We'll text you a code.",
    sending: "Sending...",
    textMeCode: "Text me a code",
    terms: "Terms and Conditions",
  },
  signup: {
    title: "Create an account",
    subtitle: "We verify your identity, then an administrator approves your account",
    firstName: "First name",
    lastName: "Last name",
    phoneNote: "You can sign in with your email or this phone number.",
    iAmA: "I am a",
    chooseRole: "Choose your role",
    roles: { PATIENT: "Patient", DOCTOR: "Doctor", NURSE: "Nurse", RECEPTIONIST: "Receptionist", PHARMACIST: "Pharmacist" } as Record<(typeof SIGNUP_ROLES)[number], string>,
    photo: "Your photo",
    photoHint: "A clear photo of your face",
    idCard: "Identity card",
    idCardHint: "National ID, passport, driver's licence or voter card",
    confirmPassword: "Confirm password",
    idPrivacy:
      "Your ID is stored privately and only administrators can see it. It is checked automatically with AI to confirm it matches your photo and name.",
    agreeTo: "I have read and agree to the",
    addPhoto: "Add your photo.",
    addIdCard: "Add your identity card.",
    create: "Create Account",
    creating: "Creating account...",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    doneTitle: "Account created",
    doneBody: (name: string) =>
      `Thanks, ${name}. We're checking your photo and ID, and an administrator needs to approve your account before you can sign in.`,
    donePatient: (email: string) =>
      `Once it's activated, sign in with ${email} and your password, or with a code texted to your phone.`,
    doneOther: (email: string) => `You'll be able to sign in with ${email} once it's activated.`,
    backToSignIn: "Back to Sign In",
  },
};

export type Dictionary = typeof en;
export type NavLabel = keyof Dictionary["nav"];

const fr: Dictionary = {
  nav: {
    dashboard: "Tableau de bord",
    home: "Accueil",
    appointments: "Rendez-vous",
    patients: "Patients",
    doctors: "Médecins",
    staff: "Personnel",
    verification: "Vérification",
    hospitals: "Hôpitaux",
    pharmacy: "Pharmacie",
    billing: "Facturation",
    billsPayments: "Factures et paiements",
    chat: "Messagerie",
    messages: "Messages",
    sms: "SMS",
    settings: "Paramètres",
    videoCalls: "Appels vidéo",
    myRecords: "Mon dossier",
    myProfile: "Mon profil",
    schedule: "Planning",
    prescriptions: "Ordonnances",
    stock: "Stock",
  },
  topbar: {
    toggleSidebar: "Afficher ou masquer le menu",
    language: "Langue",
    accountSettings: "Paramètres du compte",
    signOut: "Se déconnecter",
  },
  login: {
    welcome: "Bon retour",
    subtitle: "Connectez-vous à votre compte",
    iAmA: "Je suis",
    patient: "Patient",
    doctorStaff: "Médecin / Personnel",
    signInWith: "Se connecter avec",
    email: "E-mail",
    phone: "Téléphone",
    phoneNumber: "Numéro de téléphone",
    password: "Mot de passe",
    signIn: "Se connecter",
    signingIn: "Connexion...",
    noAccount: "Vous n'avez pas de compte ?",
    createOne: "Créez-en un",
    noPasswordYet:
      "Pas encore de mot de passe ? Connectez-vous avec votre téléphone, puis définissez-en un dans les Paramètres.",
    sharedNumber: "Ce numéro est partagé par plusieurs patients. Qui se connecte ?",
    differentNumber: "Utiliser un autre numéro",
    enterCode: "Saisissez le code que nous vous avons envoyé par SMS.",
    code: "Code à 6 chiffres",
    checking: "Vérification...",
    newCode: "Envoyer un nouveau code",
    changeNumber: "Changer de numéro",
    clinicNumber: "Utilisez le numéro que la clinique a pour vous. Nous vous enverrons un code par SMS.",
    sending: "Envoi...",
    textMeCode: "M'envoyer un code",
    terms: "Conditions générales",
  },
  signup: {
    title: "Créer un compte",
    subtitle: "Nous vérifions votre identité, puis un administrateur approuve votre compte",
    firstName: "Prénom",
    lastName: "Nom",
    phoneNote: "Vous pouvez vous connecter avec votre e-mail ou ce numéro de téléphone.",
    iAmA: "Je suis",
    chooseRole: "Choisissez votre rôle",
    roles: { PATIENT: "Patient", DOCTOR: "Médecin", NURSE: "Infirmier/Infirmière", RECEPTIONIST: "Réceptionniste", PHARMACIST: "Pharmacien" },
    photo: "Votre photo",
    photoHint: "Une photo nette de votre visage",
    idCard: "Pièce d'identité",
    idCardHint: "Carte d'identité, passeport, permis de conduire ou carte d'électeur",
    confirmPassword: "Confirmer le mot de passe",
    idPrivacy:
      "Votre pièce d'identité est conservée de façon confidentielle et seuls les administrateurs peuvent la voir. Elle est vérifiée automatiquement par IA pour confirmer qu'elle correspond à votre photo et à votre nom.",
    agreeTo: "J'ai lu et j'accepte les",
    addPhoto: "Ajoutez votre photo.",
    addIdCard: "Ajoutez votre pièce d'identité.",
    create: "Créer le compte",
    creating: "Création du compte...",
    haveAccount: "Vous avez déjà un compte ?",
    signIn: "Se connecter",
    doneTitle: "Compte créé",
    doneBody: (name: string) =>
      `Merci, ${name}. Nous vérifions votre photo et votre pièce d'identité, et un administrateur doit approuver votre compte avant que vous puissiez vous connecter.`,
    donePatient: (email: string) =>
      `Une fois activé, connectez-vous avec ${email} et votre mot de passe, ou avec un code envoyé par SMS sur votre téléphone.`,
    doneOther: (email: string) => `Vous pourrez vous connecter avec ${email} une fois votre compte activé.`,
    backToSignIn: "Retour à la connexion",
  },
};

export const DICTIONARIES: Record<Locale, Dictionary> = { en, fr };
