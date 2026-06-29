// i18n du portail client (/j/[token]) — 5 langues, sans dépendance externe.
// Le client choisit sa langue à la 1re étape. Le reste de l'app (gestor) reste en ES.
import { labelADocTipo } from "@/lib/tramites";

export type Lang = "es" | "en" | "fr" | "it" | "de";

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

type Tr = Record<Lang, string>;

// Chaînes d'interface. {var} → interpolé par t().
const UI: Record<string, Tr> = {
  "header.con": { es: "con", en: "with", fr: "avec", it: "con", de: "mit" },
  "lang.elige": { es: "Idioma", en: "Language", fr: "Langue", it: "Lingua", de: "Sprache" },
  "lang.selectLabel": { es: "Elige tu idioma", en: "Choose your language", fr: "Choisissez votre langue", it: "Scegli la tua lingua", de: "Wähle deine Sprache" },

  "step.tramite": { es: "Trámite", en: "Service", fr: "Démarche", it: "Pratica", de: "Verfahren" },
  "step.datos": { es: "Tus datos", en: "Your details", fr: "Vos infos", it: "I tuoi dati", de: "Deine Daten" },
  "step.documentos": { es: "Documentos", en: "Documents", fr: "Documents", it: "Documenti", de: "Dokumente" },
  "step.pago": { es: "Pago", en: "Payment", fr: "Paiement", it: "Pagamento", de: "Zahlung" },

  "common.continuar": { es: "Continuar", en: "Continue", fr: "Continuer", it: "Continua", de: "Weiter" },
  "common.atras": { es: "Atrás", en: "Back", fr: "Retour", it: "Indietro", de: "Zurück" },

  "s0.hola": { es: "Hola {nombre} 👋", en: "Hi {nombre} 👋", fr: "Bonjour {nombre} 👋", it: "Ciao {nombre} 👋", de: "Hallo {nombre} 👋" },
  "s0.intro": {
    es: "Tu gestoría te ayuda con tu trámite de extranjería. ¿Cuál necesitas?",
    en: "Your agency is helping with your immigration procedure. Which one do you need?",
    fr: "Votre cabinet vous accompagne dans votre démarche d'immigration. Laquelle vous faut-il ?",
    it: "Il tuo studio ti assiste nella tua pratica di immigrazione. Quale ti serve?",
    de: "Deine Kanzlei hilft dir bei deinem Aufenthaltsverfahren. Welches brauchst du?",
  },
  "s0.sinServicios": {
    es: "Tu gestoría aún no ha configurado los servicios disponibles.",
    en: "Your agency hasn't set up the available services yet.",
    fr: "Votre cabinet n'a pas encore configuré les services disponibles.",
    it: "Il tuo studio non ha ancora configurato i servizi disponibili.",
    de: "Deine Kanzlei hat die verfügbaren Leistungen noch nicht eingerichtet.",
  },
  "pago.split": {
    es: "{a} al empezar + {b} al finalizar",
    en: "{a} to start + {b} on completion",
    fr: "{a} au début + {b} à la fin",
    it: "{a} all'inizio + {b} alla fine",
    de: "{a} zu Beginn + {b} am Ende",
  },
  "pago.unico": { es: "Pago único al empezar", en: "One-time payment to start", fr: "Paiement unique au début", it: "Pagamento unico all'inizio", de: "Einmalige Zahlung zu Beginn" },
  "pago.final": { es: "Pago al finalizar el trámite", en: "Payment on completion", fr: "Paiement à la fin de la démarche", it: "Pagamento alla fine della pratica", de: "Zahlung am Ende des Verfahrens" },
  "pago.ivaIncluido": { es: "IVA incluido", en: "VAT included", fr: "TVA incluse", it: "IVA inclusa", de: "inkl. MwSt." },

  "s1.intro": {
    es: "Con estos datos preparamos tus formularios oficiales. Rellénalos una sola vez.",
    en: "We use these details to prepare your official forms. Fill them in just once.",
    fr: "Ces informations servent à préparer vos formulaires officiels. À remplir une seule fois.",
    it: "Con questi dati prepariamo i tuoi moduli ufficiali. Compilali una sola volta.",
    de: "Mit diesen Angaben erstellen wir deine amtlichen Formulare. Nur einmal ausfüllen.",
  },
  "s1.guardando": { es: "Guardando…", en: "Saving…", fr: "Enregistrement…", it: "Salvataggio…", de: "Speichern…" },
  "s1.faltan": {
    es: "Completa los campos obligatorios que faltan ({n}).",
    en: "Complete the missing required fields ({n}).",
    fr: "Complète les champs obligatoires manquants ({n}).",
    it: "Completa i campi obbligatori mancanti ({n}).",
    de: "Fülle die fehlenden Pflichtfelder aus ({n}).",
  },
  "s1.opcional": { es: "opcional", en: "optional", fr: "facultatif", it: "facoltativo", de: "optional" },
  "s1.apellidosHint": {
    es: "Si tienes dos apellidos, escríbelos separados por un espacio.",
    en: "If you have two surnames, separate them with a space.",
    fr: "Si vous avez deux noms de famille, séparez-les par un espace.",
    it: "Se hai due cognomi, separali con uno spazio.",
    de: "Bei zwei Nachnamen mit Leerzeichen trennen.",
  },

  "s2.intro": {
    es: "Haz una foto o sube cada documento. La IA comprueba al instante que sea legible y esté vigente.",
    en: "Take a photo or upload each document. The AI instantly checks it's legible and valid.",
    fr: "Prenez une photo ou téléversez chaque document. L'IA vérifie à l'instant qu'il est lisible et valide.",
    it: "Scatta una foto o carica ogni documento. L'IA verifica subito che sia leggibile e valido.",
    de: "Mach ein Foto oder lade jedes Dokument hoch. Die KI prüft sofort Lesbarkeit und Gültigkeit.",
  },
  "s2.subir": { es: "Subir", en: "Upload", fr: "Téléverser", it: "Carica", de: "Hochladen" },
  "s2.analizando": { es: "Analizando…", en: "Analyzing…", fr: "Analyse…", it: "Analisi…", de: "Wird geprüft…" },
  "s2.validado": { es: "Validado", en: "Validated", fr: "Validé", it: "Validato", de: "Geprüft" },
  "s2.volverSubir": { es: "Volver a subir", en: "Upload again", fr: "Réessayer", it: "Ricarica", de: "Erneut hochladen" },
  "s2.eliminar": { es: "Eliminar documento", en: "Remove document", fr: "Supprimer le document", it: "Elimina documento", de: "Dokument entfernen" },
  "s2.borrosa": {
    es: "La foto está borrosa y no se lee bien. Vuelve a hacerla con buena luz.",
    en: "The photo is blurry and hard to read. Retake it with good lighting.",
    fr: "La photo est floue et illisible. Reprenez-la avec une bonne lumière.",
    it: "La foto è sfocata e poco leggibile. Rifalla con buona luce.",
    de: "Das Foto ist unscharf und schwer lesbar. Mit gutem Licht neu aufnehmen.",
  },
  "s2.noSeLee": {
    es: "El documento no se lee bien. Vuelve a subirlo.",
    en: "The document is hard to read. Please upload it again.",
    fr: "Le document est difficile à lire. Téléversez-le à nouveau.",
    it: "Il documento è poco leggibile. Caricalo di nuovo.",
    de: "Das Dokument ist schwer lesbar. Bitte erneut hochladen.",
  },
  "s2.errorSubir": {
    es: "Error al subir. Inténtalo de nuevo.",
    en: "Upload error. Please try again.",
    fr: "Erreur d'envoi. Réessayez.",
    it: "Errore nel caricamento. Riprova.",
    de: "Fehler beim Hochladen. Bitte erneut versuchen.",
  },
  "s2.continuarPago": { es: "Continuar al pago", en: "Continue to payment", fr: "Passer au paiement", it: "Vai al pagamento", de: "Weiter zur Zahlung" },
  "s2.enviar": { es: "Enviar a mi gestoría", en: "Send to my agency", fr: "Envoyer à mon cabinet", it: "Invia al mio studio", de: "An meine Kanzlei senden" },
  "s2.subeTodos": { es: "Sube todos los documentos", en: "Upload all documents", fr: "Téléversez tous les documents", it: "Carica tutti i documenti", de: "Alle Dokumente hochladen" },
  "s2.queEsto": { es: "¿Qué es esto?", en: "What's this?", fr: "Qu'est-ce que c'est ?", it: "Cos'è?", de: "Was ist das?" },
  "s2.faltanDocs": {
    es: "Aún te faltan documentos. Puedes enviarlos ahora o subirlos más tarde desde este mismo enlace; tu gestoría no podrá presentar el expediente hasta tenerlos todos.",
    en: "Some documents are still missing. You can send now and upload the rest later from this same link; your agency can't submit the file until they're all in.",
    fr: "Il manque encore des documents. Vous pouvez envoyer maintenant et téléverser le reste plus tard depuis ce lien ; votre cabinet ne pourra pas déposer le dossier tant qu'ils ne sont pas tous là.",
    it: "Mancano ancora alcuni documenti. Puoi inviare ora e caricare il resto più tardi da questo stesso link; il tuo studio non potrà presentare la pratica finché non ci sono tutti.",
    de: "Es fehlen noch Dokumente. Du kannst jetzt senden und den Rest später über denselben Link hochladen; deine Kanzlei kann den Antrag erst einreichen, wenn alle vorliegen.",
  },
  "s2.sinDocs": { es: "Para este trámite no necesitas subir ningún documento. Puedes continuar.", en: "This procedure doesn't require you to upload any documents. You can continue.", fr: "Ce dossier ne nécessite aucun document à téléverser. Vous pouvez continuer.", it: "Per questa pratica non devi caricare alcun documento. Puoi continuare.", de: "Für diesen Vorgang musst du keine Dokumente hochladen. Du kannst fortfahren." },
  "s2.continuarIgual": { es: "Continuar de todos modos", en: "Continue anyway", fr: "Continuer quand même", it: "Continua comunque", de: "Trotzdem fortfahren" },
  "s2.seguirSubiendo": { es: "Seguir subiendo", en: "Keep uploading", fr: "Continuer à téléverser", it: "Continua a caricare", de: "Weiter hochladen" },
  "s2.continuar": { es: "Continuar", en: "Continue", fr: "Continuer", it: "Continua", de: "Weiter" },
  "s2.todosOk": {
    es: "¡Listo! Todos tus documentos se han subido y validado correctamente.",
    en: "All done! All your documents have been uploaded and validated successfully.",
    fr: "C'est bon ! Tous tes documents ont été téléversés et validés avec succès.",
    it: "Fatto! Tutti i tuoi documenti sono stati caricati e convalidati correttamente.",
    de: "Fertig! Alle deine Dokumente wurden hochgeladen und erfolgreich geprüft.",
  },
  "s2.puedesDespues": {
    es: "Sube los que tengas ahora. Podrás subir los que falten más tarde desde el enlace de seguimiento que te enviaremos.",
    en: "Upload the ones you have now. You can add any missing documents later from the tracking link we'll send you.",
    fr: "Téléverse ceux que tu as. Tu pourras ajouter les documents manquants plus tard depuis le lien de suivi que nous t'enverrons.",
    it: "Carica quelli che hai ora. Potrai aggiungere i documenti mancanti più tardi dal link di monitoraggio che ti invieremo.",
    de: "Lade jetzt die vorhandenen hoch. Fehlende Dokumente kannst du später über den Tracking-Link nachreichen, den wir dir senden.",
  },

  "s3.titulo": { es: "Pago inicial", en: "Initial payment", fr: "Paiement initial", it: "Pagamento iniziale", de: "Anzahlung" },
  "s3.intro": {
    es: "Para iniciar tu trámite, tu gestoría solicita un pago al empezar. Recibirás la factura al instante.",
    en: "To start your procedure, your agency asks for an upfront payment. You'll get the invoice instantly.",
    fr: "Pour lancer votre démarche, votre cabinet demande un paiement initial. Vous recevrez la facture aussitôt.",
    it: "Per avviare la pratica, il tuo studio richiede un pagamento iniziale. Riceverai subito la fattura.",
    de: "Für den Start verlangt deine Kanzlei eine Anzahlung. Die Rechnung erhältst du sofort.",
  },
  "s3.anticipo": { es: "{label} — anticipo", en: "{label} — upfront", fr: "{label} — acompte", it: "{label} — acconto", de: "{label} — Anzahlung" },
  "s3.iva": { es: "IVA (21 %)", en: "VAT (21%)", fr: "TVA (21 %)", it: "IVA (21%)", de: "MwSt. (21 %)" },
  "s3.totalHoy": { es: "Total a pagar hoy", en: "Total due today", fr: "Total à payer aujourd'hui", it: "Totale da pagare oggi", de: "Heute fällig" },
  "s3.queda": {
    es: "Quedará un pago de {monto} al finalizar el trámite. Te avisaremos.",
    en: "A payment of {monto} will remain on completion. We'll let you know.",
    fr: "Un paiement de {monto} restera dû à la fin. Nous vous préviendrons.",
    it: "Resterà un pagamento di {monto} alla fine. Ti avviseremo.",
    de: "Am Ende bleibt eine Zahlung von {monto}. Wir melden uns.",
  },
  "s3.tarjeta": { es: "Tarjeta", en: "Card", fr: "Carte", it: "Carta", de: "Karte" },
  "s3.pagoSeguro": { es: "Pago seguro", en: "Secure payment", fr: "Paiement sécurisé", it: "Pagamento sicuro", de: "Sichere Zahlung" },
  "s3.pagar": { es: "Pagar {monto}", en: "Pay {monto}", fr: "Payer {monto}", it: "Paga {monto}", de: "{monto} zahlen" },
  "s3.confirmar": { es: "Confirmar", en: "Confirm", fr: "Confirmer", it: "Conferma", de: "Bestätigen" },
  "s3.transferencia": { es: "Al confirmar, recibirás por email la factura con los datos para pagar por transferencia bancaria.", en: "Once confirmed, you'll receive the invoice by email with the bank-transfer details.", fr: "Après confirmation, tu recevras par email la facture avec les coordonnées pour payer par virement.", it: "Dopo la conferma, riceverai via email la fattura con i dati per il bonifico.", de: "Nach der Bestätigung erhältst du die Rechnung per E-Mail mit den Überweisungsdaten." },
  "s3.procesando": { es: "Procesando…", en: "Processing…", fr: "Traitement…", it: "Elaborazione…", de: "Wird verarbeitet…" },
  "s3.metodos": { es: "Paga ahora con tarjeta de forma segura, o por transferencia (te enviaremos la factura con los datos bancarios).", en: "Pay now securely by card, or by bank transfer (we'll email you the invoice with the bank details).", fr: "Paie maintenant par carte en toute sécurité, ou par virement (nous t'enverrons la facture avec les coordonnées bancaires).", it: "Paga subito con carta in modo sicuro, oppure con bonifico (ti invieremo la fattura con i dati bancari).", de: "Zahle jetzt sicher per Karte oder per Überweisung (wir senden dir die Rechnung mit den Bankdaten)." },
  "s3.pagarTarjeta": { es: "Pagar {monto} con tarjeta", en: "Pay {monto} by card", fr: "Payer {monto} par carte", it: "Paga {monto} con carta", de: "{monto} per Karte zahlen" },
  "s3.pagarTransferencia": { es: "Pagar por transferencia", en: "Pay by bank transfer", fr: "Payer par virement", it: "Paga con bonifico", de: "Per Überweisung zahlen" },
  "s3.errorPago": { es: "No se pudo procesar el pago.", en: "The payment could not be processed.", fr: "Le paiement n'a pas pu être traité.", it: "Impossibile elaborare il pagamento.", de: "Die Zahlung konnte nicht verarbeitet werden." },

  "s4.titulo": { es: "¡Todo enviado!", en: "All done!", fr: "Tout est envoyé !", it: "Tutto inviato!", de: "Alles erledigt!" },
  "s4.intro": {
    es: "Tu gestoría ya tiene tus datos y documentos validados. Se encarga del resto y te avisará en cada paso.",
    en: "Your agency now has your validated details and documents. They'll handle the rest and keep you posted.",
    fr: "Votre cabinet a vos données et documents validés. Il s'occupe du reste et vous tiendra informé à chaque étape.",
    it: "Il tuo studio ha i tuoi dati e documenti validati. Penserà al resto e ti aggiornerà a ogni passo.",
    de: "Deine Kanzlei hat deine geprüften Daten und Dokumente. Sie übernimmt den Rest und hält dich auf dem Laufenden.",
  },
  "s4.resumen": { es: "Resumen", en: "Summary", fr: "Récapitulatif", it: "Riepilogo", de: "Zusammenfassung" },
  "s4.documentos": { es: "Documentos", en: "Documents", fr: "Documents", it: "Documenti", de: "Dokumente" },
  "s4.nValidados": { es: "{n} validados ✓", en: "{n} validated ✓", fr: "{n} validés ✓", it: "{n} validati ✓", de: "{n} geprüft ✓" },
  "s4.gestoria": { es: "Gestoría", en: "Agency", fr: "Cabinet", it: "Studio", de: "Kanzlei" },
  "s4.facturaEmail": {
    es: "Hemos enviado la factura {numero} a tu email. El pago final se solicitará al terminar el trámite.",
    en: "We've sent invoice {numero} to your email. The final payment will be requested when the procedure ends.",
    fr: "Nous avons envoyé la facture {numero} à votre e-mail. Le paiement final sera demandé à la fin de la démarche.",
    it: "Abbiamo inviato la fattura {numero} alla tua email. Il pagamento finale sarà richiesto al termine della pratica.",
    de: "Wir haben die Rechnung {numero} an deine E-Mail gesendet. Die Schlusszahlung wird am Ende fällig.",
  },

  // ── Page de suivi (/s/[token]) ────────────────────────────────────────────
  "seg.titulo": { es: "Seguimiento de tu expediente", en: "Track your file", fr: "Suivi de votre dossier", it: "Stato della tua pratica", de: "Verfolge deinen Antrag" },
  "seg.intro": {
    es: "Aquí puedes ver el avance de tu trámite y los documentos que faltan.",
    en: "Here you can see your procedure's progress and any missing documents.",
    fr: "Vous pouvez suivre l'avancement de votre démarche et les documents manquants.",
    it: "Qui puoi vedere l'avanzamento della pratica e i documenti mancanti.",
    de: "Hier siehst du den Fortschritt deines Verfahrens und fehlende Dokumente.",
  },
  "seg.progreso": { es: "Avance", en: "Progress", fr: "Avancement", it: "Avanzamento", de: "Fortschritt" },
  "seg.docsTitulo": { es: "Tus documentos", en: "Your documents", fr: "Vos documents", it: "I tuoi documenti", de: "Deine Dokumente" },
  "seg.docOk": { es: "Recibido", en: "Received", fr: "Reçu", it: "Ricevuto", de: "Erhalten" },
  "seg.docPendiente": { es: "Por subir", en: "To upload", fr: "À fournir", it: "Da caricare", de: "Hochzuladen" },
  "seg.docRechazado": { es: "Vuelve a subirlo", en: "Re-upload", fr: "À renvoyer", it: "Ricarica", de: "Erneut hochladen" },
  "seg.todoAlDia": { es: "¡Todo al día! Tu gestoría se encarga del resto.", en: "All up to date! Your agency handles the rest.", fr: "Tout est à jour ! Votre cabinet s'occupe du reste.", it: "Tutto in regola! Il tuo studio pensa al resto.", de: "Alles aktuell! Deine Kanzlei kümmert sich um den Rest." },
  "seg.faltan": { es: "Te faltan documentos por subir.", en: "You still have documents to upload.", fr: "Il vous reste des documents à fournir.", it: "Hai ancora documenti da caricare.", de: "Du hast noch Dokumente hochzuladen." },
  "seg.descargar": { es: "Descargar", en: "Download", fr: "Télécharger", it: "Scarica", de: "Herunterladen" },
  "seg.formularios": { es: "Formularios de tu solicitud", en: "Your application forms", fr: "Les formulaires de votre demande", it: "I moduli della tua domanda", de: "Formulare deines Antrags" },
  "seg.formulariosSub": { es: "Preparados por tu gestoría a partir de tus datos. Puedes descargarlos.", en: "Prepared by your agency from your details. You can download them.", fr: "Préparés par votre cabinet à partir de vos informations. Vous pouvez les télécharger.", it: "Preparati dal tuo studio in base ai tuoi dati. Puoi scaricarli.", de: "Von deiner Kanzlei aus deinen Daten erstellt. Du kannst sie herunterladen." },
  "mil.recibido": { es: "Solicitud recibida", en: "Request received", fr: "Demande reçue", it: "Richiesta ricevuta", de: "Antrag erhalten" },
  "mil.validado": { es: "Documentos validados", en: "Documents validated", fr: "Documents validés", it: "Documenti validati", de: "Dokumente geprüft" },
  "mil.formularios": { es: "Formularios preparados", en: "Forms prepared", fr: "Formulaires préparés", it: "Moduli preparati", de: "Formulare vorbereitet" },
  "mil.presentado": { es: "Presentado ante la Administración", en: "Submitted to the authorities", fr: "Déposé auprès de l'Administration", it: "Presentato alle autorità", de: "Bei der Behörde eingereicht" },
  "mil.resuelto": { es: "Resolución favorable", en: "Favorable decision", fr: "Décision favorable", it: "Esito favorevole", de: "Positive Entscheidung" },
  "mil.cita": { es: "Cita presencial", en: "In-person appointment", fr: "Rendez-vous en personne", it: "Appuntamento di persona", de: "Persönlicher Termin" },
  "mil.tie": { es: "Trámite completado", en: "Process completed", fr: "Démarche terminée", it: "Pratica completata", de: "Vorgang abgeschlossen" },
  "seg.citaFecha": { es: "Tu cita es el", en: "Your appointment is on", fr: "Votre rendez-vous est le", it: "Il tuo appuntamento è il", de: "Dein Termin ist am" },
  "seg.citaCliente": { es: "Debes acudir en persona con tu documentación.", en: "You must attend in person with your documents.", fr: "Vous devez vous y rendre en personne avec vos documents.", it: "Devi presentarti di persona con i tuoi documenti.", de: "Du musst persönlich mit deinen Unterlagen erscheinen." },
  "seg.citaGestor": { es: "Tu gestoría acude a la cita en tu nombre; te mantendremos informado.", en: "Your agency attends the appointment on your behalf; we'll keep you posted.", fr: "Votre cabinet se rend au rendez-vous en votre nom ; nous vous tiendrons informé.", it: "Il tuo studio si reca all'appuntamento per tuo conto; ti terremo aggiornato.", de: "Deine Kanzlei nimmt den Termin in deinem Namen wahr; wir halten dich auf dem Laufenden." },

  // ── Notification de fin de parcours (email + WhatsApp) ─────────────────────
  "notif.seg.subject": { es: "Sigue tu expediente con {gestoria}", en: "Track your file with {gestoria}", fr: "Suivez votre dossier avec {gestoria}", it: "Segui la tua pratica con {gestoria}", de: "Verfolge deinen Antrag mit {gestoria}" },
  "notif.seg.titulo": { es: "Tu expediente está en marcha", en: "Your file is underway", fr: "Votre dossier est lancé", it: "La tua pratica è in corso", de: "Dein Antrag ist unterwegs" },
  "notif.seg.body": {
    es: "Hola {nombre}, hemos recibido tu solicitud. Desde este enlace puedes seguir el avance de tu expediente y subir los documentos que falten cuando quieras.",
    en: "Hi {nombre}, we've received your request. From this link you can track your file's progress and upload any missing documents whenever you like.",
    fr: "Bonjour {nombre}, nous avons reçu votre demande. Depuis ce lien, vous pouvez suivre l'avancement de votre dossier et déposer les documents manquants quand vous le souhaitez.",
    it: "Ciao {nombre}, abbiamo ricevuto la tua richiesta. Da questo link puoi seguire l'avanzamento della pratica e caricare i documenti mancanti quando vuoi.",
    de: "Hallo {nombre}, wir haben deinen Antrag erhalten. Über diesen Link kannst du den Fortschritt verfolgen und fehlende Dokumente jederzeit hochladen.",
  },
  "notif.seg.boton": { es: "Seguir mi expediente", en: "Track my file", fr: "Suivre mon dossier", it: "Segui la mia pratica", de: "Antrag verfolgen" },

  // ── Vue « ya completado » (lien initial /j après l'onboarding) ─────────────
  "done.titulo": { es: "Ya has enviado tu solicitud", en: "Your request is already sent", fr: "Votre demande a déjà été envoyée", it: "La tua richiesta è già stata inviata", de: "Dein Antrag wurde bereits gesendet" },
  "done.intro": {
    es: "Ya completaste este paso. Tu gestoría tiene tus datos. Desde el seguimiento puedes ver el avance de tu expediente y subir los documentos que falten.",
    en: "You've completed this step. Your agency has your details. From the tracking page you can see your file's progress and upload any missing documents.",
    fr: "Vous avez terminé cette étape. Votre cabinet a vos informations. Depuis le suivi, vous pouvez voir l'avancement de votre dossier et déposer les documents manquants.",
    it: "Hai completato questo passaggio. Il tuo studio ha i tuoi dati. Dalla pagina di monitoraggio puoi vedere l'avanzamento e caricare i documenti mancanti.",
    de: "Du hast diesen Schritt abgeschlossen. Deine Kanzlei hat deine Daten. Auf der Tracking-Seite siehst du den Fortschritt und kannst fehlende Dokumente hochladen.",
  },
};

// Étiquettes des champs de la ficha (par clé ClienteFicha).
const FIELD_LABELS: Record<string, Tr> = {
  nombre: { es: "Nombre", en: "First name", fr: "Prénom", it: "Nome", de: "Vorname" },
  apellidos: { es: "Apellidos", en: "Surname(s)", fr: "Nom(s) de famille", it: "Cognome/i", de: "Nachname(n)" },
  sexo: { es: "Sexo", en: "Sex", fr: "Sexe", it: "Sesso", de: "Geschlecht" },
  estadoCivil: { es: "Estado civil", en: "Marital status", fr: "État civil", it: "Stato civile", de: "Familienstand" },
  fechaNacimiento: { es: "Fecha de nacimiento", en: "Date of birth", fr: "Date de naissance", it: "Data di nascita", de: "Geburtsdatum" },
  nacionalidad: { es: "Nacionalidad", en: "Nationality", fr: "Nationalité", it: "Nazionalità", de: "Staatsangehörigkeit" },
  lugarNacimiento: { es: "Lugar de nacimiento (ciudad)", en: "Place of birth (city)", fr: "Lieu de naissance (ville)", it: "Luogo di nascita (città)", de: "Geburtsort (Stadt)" },
  paisNacimiento: { es: "País de nacimiento", en: "Country of birth", fr: "Pays de naissance", it: "Paese di nascita", de: "Geburtsland" },
  numeroDocumento: { es: "NIE / Pasaporte", en: "NIE / Passport", fr: "NIE / Passeport", it: "NIE / Passaporto", de: "NIE / Reisepass" },
  nombrePadre: { es: "Apellidos de los padres", en: "Parents' surname", fr: "Nom de famille des parents", it: "Cognome dei genitori", de: "Nachname der Eltern" },
  nombreMadre: { es: "Nombre de la madre", en: "Mother's name", fr: "Nom de la mère", it: "Nome della madre", de: "Name der Mutter" },
  via: { es: "Domicilio (calle, plaza…)", en: "Address (street, square…)", fr: "Adresse (rue, place…)", it: "Indirizzo (via, piazza…)", de: "Adresse (Straße, Platz…)" },
  numeroVia: { es: "Número", en: "Number", fr: "Numéro", it: "Numero", de: "Hausnummer" },
  piso: { es: "Piso / puerta", en: "Floor / door", fr: "Étage / porte", it: "Piano / interno", de: "Etage / Tür" },
  codigoPostal: { es: "Código postal", en: "Postal code", fr: "Code postal", it: "Codice postale", de: "Postleitzahl" },
  municipio: { es: "Municipio", en: "Town / city", fr: "Commune", it: "Comune", de: "Stadt / Gemeinde" },
  provincia: { es: "Provincia", en: "Province", fr: "Province", it: "Provincia", de: "Provinz" },
  telefono: { es: "Teléfono", en: "Phone", fr: "Téléphone", it: "Telefono", de: "Telefon" },
  email: { es: "Email", en: "Email", fr: "E-mail", it: "Email", de: "E-Mail" },
};

const GRUPO_LABELS: Record<string, Tr> = {
  Identidad: { es: "Identidad", en: "Identity", fr: "Identité", it: "Identità", de: "Identität" },
  Domicilio: { es: "Domicilio", en: "Address", fr: "Domicile", it: "Domicilio", de: "Wohnsitz" },
  Contacto: { es: "Contacto", en: "Contact", fr: "Contact", it: "Contatto", de: "Kontakt" },
};

const SEXO_LABELS: Record<string, Tr> = {
  "": { es: "—", en: "—", fr: "—", it: "—", de: "—" },
  M: { es: "Mujer", en: "Female", fr: "Femme", it: "Donna", de: "Weiblich" },
  H: { es: "Hombre", en: "Male", fr: "Homme", it: "Uomo", de: "Männlich" },
  X: { es: "Indefinido", en: "Unspecified", fr: "Indéfini", it: "Indefinito", de: "Unbestimmt" },
};

const ESTADO_CIVIL_LABELS: Record<string, Tr> = {
  "": { es: "—", en: "—", fr: "—", it: "—", de: "—" },
  S: { es: "Soltero/a", en: "Single", fr: "Célibataire", it: "Celibe/Nubile", de: "Ledig" },
  C: { es: "Casado/a", en: "Married", fr: "Marié·e", it: "Coniugato/a", de: "Verheiratet" },
  V: { es: "Viudo/a", en: "Widowed", fr: "Veuf/Veuve", it: "Vedovo/a", de: "Verwitwet" },
  D: { es: "Divorciado/a", en: "Divorced", fr: "Divorcé·e", it: "Divorziato/a", de: "Geschieden" },
  Sp: { es: "Separado/a", en: "Separated", fr: "Séparé·e", it: "Separato/a", de: "Getrennt" },
};

// Services par défaut (label + desc) — traduits par id. Les services personnalisés
// du gestor gardent leur libellé d'origine (fallback).
const SERVICIO_I18N: Record<string, { label: Tr; desc: Tr }> = {
  arraigo_social: {
    label: { es: "Arraigo social", en: "Social roots (arraigo)", fr: "Arraigo social", it: "Arraigo social", de: "Arraigo social" },
    desc: { es: "Residencia por arraigo", en: "Residence by social roots", fr: "Titre de séjour pour ancrage social", it: "Permesso per radicamento sociale", de: "Aufenthalt durch soziale Verwurzelung" },
  },
  renovacion_tie: {
    label: { es: "Renovación de TIE", en: "TIE renewal", fr: "Renouvellement du TIE", it: "Rinnovo del TIE", de: "TIE-Verlängerung" },
    desc: { es: "Renovar tu tarjeta de residencia", en: "Renew your residence card", fr: "Renouveler votre carte de séjour", it: "Rinnova la tua carta di soggiorno", de: "Verlängere deine Aufenthaltskarte" },
  },
  reagrupacion: {
    label: { es: "Reagrupación familiar", en: "Family reunification", fr: "Regroupement familial", it: "Ricongiungimento familiare", de: "Familienzusammenführung" },
    desc: { es: "Traer a tu familia", en: "Bring your family over", fr: "Faire venir votre famille", it: "Far venire la tua famiglia", de: "Hol deine Familie nach" },
  },
  nacionalidad: {
    label: { es: "Nacionalidad española", en: "Spanish nationality", fr: "Nationalité espagnole", it: "Cittadinanza spagnola", de: "Spanische Staatsbürgerschaft" },
    desc: { es: "Solicitar la nacionalidad", en: "Apply for nationality", fr: "Demander la nationalité", it: "Richiedere la cittadinanza", de: "Staatsbürgerschaft beantragen" },
  },
  arraigo_laboral: {
    label: { es: "Arraigo laboral", en: "Work roots (arraigo laboral)", fr: "Arraigo laboral", it: "Arraigo laboral", de: "Arraigo laboral" },
    desc: { es: "Residencia por arraigo laboral", en: "Residence by work roots", fr: "Titre de séjour pour ancrage professionnel", it: "Permesso per radicamento lavorativo", de: "Aufenthalt durch berufliche Verwurzelung" },
  },
  larga_duracion: {
    label: { es: "Residencia de larga duración", en: "Long-term residence", fr: "Séjour de longue durée", it: "Soggiorno di lungo periodo", de: "Daueraufenthalt" },
    desc: { es: "Residencia permanente", en: "Permanent residence", fr: "Résidence permanente", it: "Residenza permanente", de: "Dauerhafter Aufenthalt" },
  },
  nie: {
    label: { es: "Asignación de NIE", en: "NIE assignment", fr: "Attribution du NIE", it: "Assegnazione del NIE", de: "NIE-Zuteilung" },
    desc: { es: "Obtener tu número de identidad", en: "Get your identity number", fr: "Obtenir votre numéro d'identité", it: "Ottieni il tuo numero d'identità", de: "Erhalte deine Identitätsnummer" },
  },
};

// Documents (par enum DocumentoTipo) : label affiché + infobulle « ce qui est attendu » (#5).
const DOC_I18N: Record<string, { label: Tr; help: Tr }> = {
  PASAPORTE: {
    label: { es: "Pasaporte", en: "Passport", fr: "Passeport", it: "Passaporto", de: "Reisepass" },
    help: { es: "Página con tu foto y tus datos. Debe estar vigente y leerse con claridad.", en: "The page with your photo and details. Must be valid and clearly legible.", fr: "La page avec votre photo et vos informations. Doit être en cours de validité et bien lisible.", it: "La pagina con la tua foto e i tuoi dati. Deve essere valido e ben leggibile.", de: "Die Seite mit Foto und Daten. Muss gültig und gut lesbar sein." },
  },
  TARJETA_RESIDENCIA_TIE: {
    label: { es: "TIE actual", en: "Current TIE card", fr: "Carte TIE actuelle", it: "TIE attuale", de: "Aktuelle TIE-Karte" },
    help: { es: "Tu tarjeta de residencia (anverso y reverso), aunque esté caducada.", en: "Your residence card (front and back), even if expired.", fr: "Votre carte de séjour (recto et verso), même périmée.", it: "La tua carta di soggiorno (fronte e retro), anche se scaduta.", de: "Deine Aufenthaltskarte (Vorder- und Rückseite), auch wenn abgelaufen." },
  },
  CERTIFICADO_NIE: {
    label: { es: "Certificado NIE", en: "NIE certificate", fr: "Certificat NIE", it: "Certificato NIE", de: "NIE-Bescheinigung" },
    help: { es: "Documento donde aparece tu número de NIE.", en: "The document showing your NIE number.", fr: "Le document où figure votre numéro NIE.", it: "Il documento con il tuo numero NIE.", de: "Das Dokument mit deiner NIE-Nummer." },
  },
  EMPADRONAMIENTO: {
    label: { es: "Certificado de empadronamiento", en: "Proof of registration (empadronamiento)", fr: "Certificat de domicile (empadronamiento)", it: "Certificato di residenza (empadronamiento)", de: "Meldebescheinigung (empadronamiento)" },
    help: { es: "Certificado o volante de empadronamiento reciente (menos de 3 meses).", en: "A recent town-hall registration certificate (less than 3 months old).", fr: "Certificat d'inscription à la mairie récent (moins de 3 mois).", it: "Certificato di residenza recente (meno di 3 mesi).", de: "Aktuelle Meldebescheinigung (nicht älter als 3 Monate)." },
  },
  CONTRATO_TRABAJO: {
    label: { es: "Contrato de trabajo", en: "Employment contract", fr: "Contrat de travail", it: "Contratto di lavoro", de: "Arbeitsvertrag" },
    help: { es: "Contrato firmado por ti y la empresa, con fechas y salario.", en: "Contract signed by you and the employer, with dates and salary.", fr: "Contrat signé par vous et l'employeur, avec dates et salaire.", it: "Contratto firmato da te e dall'azienda, con date e stipendio.", de: "Von dir und dem Arbeitgeber unterschriebener Vertrag mit Daten und Gehalt." },
  },
  NOMINA: {
    label: { es: "Nómina", en: "Payslip", fr: "Bulletin de salaire", it: "Busta paga", de: "Gehaltsabrechnung" },
    help: { es: "Tus últimas nóminas (normalmente las 3 más recientes).", en: "Your latest payslips (usually the last 3).", fr: "Vos derniers bulletins de salaire (en général les 3 derniers).", it: "Le tue ultime buste paga (di solito le ultime 3).", de: "Deine letzten Gehaltsabrechnungen (meist die letzten 3)." },
  },
  ANTECEDENTES_PENALES: {
    label: { es: "Antecedentes penales", en: "Criminal record certificate", fr: "Casier judiciaire", it: "Certificato penale", de: "Führungszeugnis" },
    help: { es: "Certificado de antecedentes penales de tu país de origen, traducido si procede.", en: "Criminal record certificate from your home country, translated if applicable.", fr: "Casier judiciaire de votre pays d'origine, traduit si nécessaire.", it: "Certificato penale del tuo paese d'origine, tradotto se necessario.", de: "Führungszeugnis aus deinem Herkunftsland, ggf. übersetzt." },
  },
  CERTIFICADO_BANCARIO: {
    label: { es: "Justificante de medios económicos", en: "Proof of funds", fr: "Justificatif de ressources", it: "Giustificativo di risorse economiche", de: "Nachweis finanzieller Mittel" },
    help: { es: "Certificado bancario o extracto reciente que muestre tus medios económicos.", en: "Bank certificate or recent statement showing your funds.", fr: "Certificat bancaire ou relevé récent montrant vos ressources.", it: "Certificato bancario o estratto conto recente con le tue risorse.", de: "Bankbescheinigung oder aktueller Kontoauszug deiner Mittel." },
  },
  LIBRO_FAMILIA: {
    label: { es: "Libro de familia", en: "Family record book", fr: "Livret de famille", it: "Libretto di famiglia", de: "Familienbuch" },
    help: { es: "Libro de familia o certificado equivalente que acredite el vínculo familiar.", en: "Family record book or equivalent proving the family bond.", fr: "Livret de famille ou document équivalent prouvant le lien familial.", it: "Libretto di famiglia o documento equivalente che provi il legame familiare.", de: "Familienbuch oder gleichwertiger Nachweis der Verwandtschaft." },
  },
  TITULO_ESTUDIOS: {
    label: { es: "Título de estudios", en: "Education certificate", fr: "Diplôme", it: "Titolo di studio", de: "Bildungsnachweis" },
    help: { es: "Título o certificado de estudios, homologado si procede.", en: "Degree or education certificate, officially recognized if applicable.", fr: "Diplôme ou certificat d'études, homologué si nécessaire.", it: "Titolo o certificato di studi, riconosciuto se necessario.", de: "Abschluss oder Bildungsnachweis, ggf. anerkannt." },
  },
  OTRO: {
    label: { es: "Documento", en: "Document", fr: "Document", it: "Documento", de: "Dokument" },
    help: { es: "Sube el documento tal como te lo ha pedido tu gestoría.", en: "Upload the document exactly as your agency requested.", fr: "Téléversez le document tel que demandé par votre cabinet.", it: "Carica il documento come richiesto dal tuo studio.", de: "Lade das Dokument wie von deiner Kanzlei angefordert hoch." },
  },
};

function pick(tr: Tr | undefined, lang: Lang, fallback: string): string {
  return tr?.[lang] ?? tr?.es ?? fallback;
}

// Fabrique la fonction de traduction pour une langue.
export function makeT(lang: Lang) {
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = pick(UI[key], lang, key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    // pluriel naïf pour {n, plural} (juste retirer la syntaxe restante)
    s = s.replace(/\{n, plural\}/g, "");
    return s;
  };
}

export const fieldLabel = (k: string, lang: Lang) => pick(FIELD_LABELS[k], lang, k);
export const grupoLabel = (g: string, lang: Lang) => pick(GRUPO_LABELS[g], lang, g);
export const sexoLabel = (v: string, lang: Lang) => pick(SEXO_LABELS[v], lang, v);
export const estadoCivilLabel = (v: string, lang: Lang) => pick(ESTADO_CIVIL_LABELS[v], lang, v);

// Service : traduit le label/desc des services par défaut, sinon garde l'original du gestor.
export const servicioLabel = (id: string, original: string, lang: Lang) =>
  SERVICIO_I18N[id] ? pick(SERVICIO_I18N[id].label, lang, original) : original;
export const servicioDesc = (id: string, original: string, lang: Lang) =>
  SERVICIO_I18N[id] ? pick(SERVICIO_I18N[id].desc, lang, original) : original;

// Document : normalise le libellé (es) → enum → label/help traduits.
export const docLabel = (label: string, lang: Lang) => pick(DOC_I18N[labelADocTipo(label)]?.label, lang, label);
export const docHelp = (label: string, lang: Lang) => pick(DOC_I18N[labelADocTipo(label)]?.help, lang, "");

// Langue initiale : préférence du navigateur si elle fait partie des 5, sinon ES.
export function detectarLang(): Lang {
  if (typeof navigator === "undefined") return "es";
  const n = (navigator.language || "es").slice(0, 2).toLowerCase();
  return (LANGS.some((l) => l.code === n) ? n : "es") as Lang;
}
