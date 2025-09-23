# Progetto AIDA

## Architettura

Il progetto è containerizzato con Docker e si basa sui seguenti componenti:

-   **Frontend**: Un'applicazione single-page costruita con React, che comunica via API e WebSockets con il server Python.
-   **Backend**: Server contenente API e WebSocket sviluppato in Python con Flask.
-   **Servizi di Data Science (Python)**: Script Python specializzati per:
    -   Generazione di dataset sintetici (`generator.py`).
    -   Estrazione di istogrammi (`extract_histograms.py`).
    -   Analisi di bilanciamento e ranking (`rank_with_diff.py`).
    -   Aumento di dati (`augmentation.py`).
-   **Servizi Spaziali (Scala)**: Script Scala ad alte prestazioni, eseguiti tramite `sbt`, per compiti intensivi come:
    -   Creazione di indici spaziali (`IndexApp`).
    -   Esecuzione di range query complesse (`RangeQueryApp`).
 
## Struttura del Progetto
La struttura del progetto è pensata per separare il codice sorgente dai dati generati.
```
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
```

## Funzionalità Principali
Il server ha il compito di controllare le seguenti operazioni, accessibili tramite il frontend:

- Gestione File: file explorer integrato con operazioni di CRUD (crea, rinomina, cancella), zip e download per tutte le directory di dati.
- Generazione Dati: crezione dataset spaziali sintetici basati su parametri definiti manualmente o tramite un file CSV.
- Indicizzazione Spaziale: script Scala per creare indici spaziali (es. R-tree) sui dataset generati.
- Range Query: esecuzione query spaziali sui dataset indicizzati, utilizzando il potente backend in Scala.
- Estrazione Istogrammi: Analizza i dataset e ne estrae gli istogrammi di distribuzione.
- Analisi di Bilanciamento: Esegue lo script rank_with_diff.py per creare "training set" bilanciati.
- Data Augmentation: Aumenta i training set esistenti applicando diverse tecniche.
- Monitoraggio Risorse: Fornisce un feedback in tempo reale sull'uso di CPU e RAM durante le operazioni più intensive.

---

## Prerequisiti

-   Git
-   Docker
-   Docker Compose

---

## Come Iniziare

### 1. Clonare la Repository

```bash
git clone "link progetto"
cd "progetto"
```

### 2. Build e Avvio dei Container
Con Docker Compose pcostruire le immagini e avviare tutti i servizi.

```bash
docker-compose up --build
```
```--build```: Forza la ricostruzione delle immagini Docker (consigliato al primo avvio).

### 3. Accesso all'Applicazione
Quando tutti i container sono in esecuzione, per accedere ai vari componenti:

🌐 Frontend React: apri il browser e vai su ```http://localhost:5173```.

---

## Comandi Docker Utili
Fermare tutti i container:

```Bash
docker-compose down
```

Vedere i log in tempo reale:

```Bash
# Per tutti i servizi
docker-compose logs -f

# Per un servizio specifico (es. backend)
docker-compose logs -f backend
```

Accedere alla shell di un container:

```Bash
# Esempio per il backend
docker-compose exec backend bash

# Esempio per il frontend
docker-compose exec frontend sh
```
