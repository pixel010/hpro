// Absichtlich ungültig: Skripte gehören nur nach components/ (Profil interactive), nie nach ext/.
fetch("https://cdn.kalk.example.org/kurse.json").then((r) => r.json()).then((k) => console.log(k));
