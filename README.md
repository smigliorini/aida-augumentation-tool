# Progetto AIDA - Backend Orchestrator
Questa è la documentazione per il backend del progetto AIDA. Il server, basato su Flask e Socket.IO, agisce come un orchestratore centrale che gestisce un'architettura a microservizi. Espone API REST e gestisce eventi in tempo reale per coordinare un frontend in React, script di generazione dati in Python e servizi ad alte prestazioni per l'analisi spaziale scritti in Scala.


# 🚀 Architettura
Il progetto è containerizzato con Docker e si basa sui seguenti componenti:

Frontend: Un'applicazione single-page costruita con React, che comunica via API e WebSockets con il server Python.

Backend Orchestrator (Questo server): Un servizio API e WebSocket sviluppato in Python con Flask. Non esegue calcoli pesanti, ma orchestra l'esecuzione di altri script e servizi.

Servizi di Data Science (Python): Script Python specializzati per:

Generazione di dataset sintetici (generator.py).

Estrazione di istogrammi (extract_histograms.py).

Analisi di bilanciamento e ranking (rank_with_diff.py).

Aumento di dati (augmentation.py).

Servizi Spaziali (Scala): Script Scala ad alte prestazioni, eseguiti tramite sbt, per compiti intensivi come:

Creazione di indici spaziali (IndexApp).

Esecuzione di range query complesse (RangeQueryApp).

Orchestrazione: L'intero ambiente è gestito tramite Docker e Docker Compose per garantire coerenza, isolamento e facilità di setup.

# ✅ Prerequisiti
Prima di iniziare, assicurati di avere installato i seguenti strumenti sul tuo sistema:

Git

Docker (versione 20.10.x o successiva)

Docker Compose (versione v2.x o successiva)

# 🛠️ Come Iniziare
Segui questi passaggi per configurare ed eseguire il progetto in locale.

1. Clona il Repository
git clone https://github.com/tuo-utente/tuo-progetto.git
cd tuo-progetto

2. Build e Avvio dei Container
Usa Docker Compose per costruire le immagini e avviare tutti i servizi.

docker-compose up --build -d

--build: Forza la ricostruzione delle immagini Docker (consigliato al primo avvio).

-d: Avvia i container in background.

3. Accedi all'Applicazione
Quando tutti i container sono in esecuzione, puoi accedere ai vari componenti:

🌐 Frontend React: apri il browser e vai su http://localhost:5173.

🐍 API Python Orchestrator: il servizio è raggiungibile all'indirizzo http://localhost:5000.

✨ Funzionalità Principali
Il server orchestra le seguenti operazioni, accessibili tramite il frontend:

Gestione File: Un file explorer integrato con operazioni di CRUD (crea, rinomina, cancella), zip e download per tutte le directory di dati.

Generazione Dati: Crea dataset spaziali sintetici basati su parametri definiti manualmente o tramite un file CSV.

Indicizzazione Spaziale: Esegue lo script Scala per creare indici spaziali (es. R-tree) sui dataset generati.

Range Query: Esegue query spaziali sui dataset indicizzati, utilizzando il potente backend in Scala.

Estrazione Istogrammi: Analizza i dataset e ne estrae gli istogrammi di distribuzione.

Analisi di Bilanciamento: Esegue lo script rank_with_diff.py per creare "training set" bilanciati.

Data Augmentation: Aumenta i training set esistenti applicando diverse tecniche.

Monitoraggio Risorse: Fornisce un feedback in tempo reale sull'uso di CPU e RAM durante le operazioni più intensive.

📂 Struttura del Progetto
La struttura del progetto è pensata per separare il codice sorgente dai dati generati.

.
├── docker-compose.yml   # Orchestra tutti i servizi
├── frontend/            # Codice sorgente del frontend React
│   └── Dockerfile
├── backend/             # Codice del server orchestratore e script Python
│   ├── server.py
│   ├── generator.py
│   ├── rank_with_diff.py
│   ├── augmentation.py
│   └── extract_histograms.py
├── scalaScript/         # Codice sorgente dei servizi Scala (IndexApp, RangeQueryApp)
├── parent_dir_dataset/  # Dati persistenti
├── indexes/             # Dati persistenti
└── ...                  # Altre directory di dati

⚙️ Comandi Docker Utili
Fermare tutti i container:

docker-compose down

Vedere i log in tempo reale:

# Per tutti i servizi
docker-compose logs -f

# Per un servizio specifico (es. backend)
docker-compose logs -f backend

Accedere alla shell di un container:

# Esempio per il backend
docker-compose exec backend bash

# Esempio per il frontend
docker-compose exec frontend sh
