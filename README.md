# AIDA: A Spatial Data Augmentation Tool for Machine Learning Dataset Preparation

## FLUSSO CORRETTO DI ESECUZIONE

## STEP 1 - Generazione dei dataset
**1.1 Compilazione del sommario**

Il primo passo è la stesura del sommario contenente le informazioni sui dataset da generare. Il file si chiamerà '*sum_datasetData_Time_UniqueCode.csv*' e dovrà essere inserito nella cartella '*summaries*'. Questo file conterrà una riga di header e ogni riga successiva corrisponderà a un dataset da generare appartenente a quel sommario. I campi del sommario saranno i seguenti:
- datasetName --> nome dell'i-esimo dataset (*datasetNumber*);
- distribution --> distribuzione delle geometrie interne al dataset in questione (campi possibili: *uniform, diagonal, gaussian, parcel, bit o sierpinski*);
- geometry --> tipo di geometria presente nel dataset in questione (campi possibili: *point, box o polygon*);
- x1, y1, x2, y2 --> dimensione della finestra relativa al dataset in questione (*[x1;y1]* punto basso sinistra, *[x2;y2]* punto alto destra);
- num_features --> numero di geometrie da generare relative al dataset in questione (*numGeometries*);
- max_seg --> numero di lati massimo relativo a ciascuna geometrie (*point* -> 1, *box* -> 4, *polygon* -> >3);
- num_points --> ;
- avg_area --> valore medio dell'area di ciascuna geometria (in linea generale, il prodotto tra *avg_side_length_0* e *avg_side_length_1*);
- avg_side_length_0 --> valore medio della dimensione relativa alla geometria, lato x;
- avg_side_length_1 --> valore medio della dimensione relativa alla geometria, lato y;
- E0, E2 --> dimensioni frattali, calcolabili in un secondo momento con gli algoritmi a disposizione.


**1.2 Effettiva generazione dei dataset**

Il prossimo passo riguarda l'effettiva generazione dei dataset che sfrutta il tool [SpiderWeb](https://spider.cs.ucr.edu/). In linea generale, modificare nel codice '*GeneratorCSV.py*' i campi '*folder_groupDataset*' e '*file_nameSummaries*' con, rispettivamente, il nome della cartella in cui verranno salvati i file ('*datasetData_Time_UniqueCode*') e il nome del sommario di partenza ('*sum_datasetData_Time_UniqueCode.csv*'). Lo script in questione, una volta lanciato, sfrutterà i dati presenti nel sommario e lancerà lo script '*Generator.py*' che procederà alla generazione dei dataset. Questi, verranno salvati nel percorso '*datasets/datasetData_Time_UniqueCode*'. Nella cartella verrà inserito anche un file corrispondente ai comandi completi lanciati per la generazione dei dataset ('*commands.log*'). Struttura dei file '*datasetNumber.ext*':
- point: due colonne contenenti x e y dei punti (x, y) --> formato file *.csv*;
- box: quattro colonne contenenti x e y del punto in basso a sinistra e in alto a destra delle box (x1, y1, x2, y2) --> formato file *.csv*;
- polygon: ogni geometria è scritta come 'POLYGON((x1 y1,x2 y2,x3 y3,x4 y4,x5 y5,x1 y1))' --> formato file *.wkt*.


## STEP 2 - Primo calcolo delle dimensioni frattali
**2.1 Dimensione frattale sulla distribuzione del dataset**

Dopo la generazione dei dataset, si procede al calcolo della dimensione frattale sulla distribuzione delle geometrie relativa a ciascun dataset generato nel sommario. Per calcolare questi valori, viene usato lo script implementato nel file '*fractalDimension.py*' (files di supporto per lo scambio di informazioni Front-end <--> Back-end: '*fdParameters.csv*' e '*fdSupport.csv*'). Per procedere al corretto calcolo della dimensione frattale in questione, si visioni nella cartella '*fd_casi*' i files '*fdSupport_general.csv*' e '*fdSupport_caseA.csv*'.

I valori che può assumere il calcolo di questo parametro variano da 0 a 2. Se si avvicina a 2, allora la distribuzione delle geometrie è abbastanza uniforme. Se si avvicina a 1, allora la distribuzione delle geometrie è pressocchè lineare.

Il calcolo corretto della dimensione frattale relativo a ciascun dataset selezionato, viene inserito nella colonna '*E2*' del file '*sum_datasetData_Time_UniqueCode.csv*'.

**2.2 Dimensione frattale sui parametri del sommario**

Successivamente si procede al calcolo della dimensione frattale relative ai campi '*avg_area*', '*avg_side_length_0*', '*avg_side_length_1*' e '*E2*' del sommario. Per calcolare questi valori, viene usato lo script implementato nel file '*fractalDimension.py*' (files di supporto per lo scambio di informazioni Front-end <--> Back-end: '*fdParameters.csv*' e '*fdSupport.csv*'). Per procedere al corretto calcolo delle dimensioni frattali in questione, si visioni nella cartella '*fd_casi*' i files '*fdSupport_general.csv*' e '*fdSupport_caseB.csv*'.

Il calcolo corretto delle dimensioni frattali relativo a ciascun parametro selezionato, viene inserito nel file '*fd_sum_datasetData_Time_UniqueCode.csv*' presente nella cartella '*fd*'. Questo file è composto da due righe :
- prima riga (header) --> '*avg_area;avg_side_length_0;avg_side_length_1;E2*';
- seconda riga (values) --> '*fd_avgArea;fd_avgSideLength0;fd_avgSideLength1;fd_E2*'.


## STEP 3 - Partizionamento dei dataset e generazione dell'indice spaziale

A questo punto, si procede con il partizionamento dei dataset con correlata generazione di un indice spaziale. Questo permette un miglioramento in termini di efficienza ed efficacia degli script richiamati nell'intero processo. L'algoritmo di partizionamento implementato è il Quad Tree (continua divisione delle partizioni in quattro fino al raggiungimento di determinati limiti prestabiliti) e sfrutta tecniche di parallelismo sulla generazione delle partizioni su diversi dataset contemporaneamente.

L'utente può scegliere di partizionare in tre modi diversi:
- definire il numero di partizioni minime che si vogliono generare;
- definire il numero di geometrie massime che ogni partizione deve contenere;
- definire il peso massimo (in bytes) che le partizioni devono pesare.

Per l'applicazione di questo step viene eseguito il file '*Indexing.py*' che usa, come file di supporto per lo scambio di informazioni tra Front-end e Back-end, il file '*indexParameters.csv*'. Quest'ultimo è composto dai seguenti campi:
- pathDatasets --> percorso completo contenente i dataset da partizionare ('*datasets/datasetData_Time_UniqueCode*');
- nameDataset --> nome del dataset da partizionare ('*datasetNumber.ext*');
- pathIndexes --> cartella dove salvare l'indice spaziale con le partizioni del dataset in analisi ('*indexes*');
- typePartition --> tipo di partizione scelta dall'utente da effettuare ('*partitions*', '*geometries*' o '*bytes*');
- num --> numero che prende valore in base al tipo di partizione scelto.

Una volta effettuata la partizione, i risultati vengono inseriti nella cartella '*indexes/datasetData_Time_UniqueCode*' in cui vengono generate, per ogni dataset partizionato, una cartella '*datasetNumber_spatialIndex*' in cui vengono inserite le partizioni generate ('*partition_0.ext*', '*partition_1*' ...) e un file contenente l'indice spaziale ('*master_table.csv*'). Quest'ultimo è composto dai seguenti campi:
- ID --> codice identificativo numerico della partizione;
- NamePartition --> nome della partizione ('*partition_number.ext*');
- NumberGeometries --> numero di geometrie appartenenti alla partizione;
- FileSize --> dimensione in bytes della partizione;
- GeometryType --> tipo di geometria contenuta nella partizione;
- xMin, yMin, xMax, yMax --> dimensioni della finestra relativa alla partizione.

## STEP 4 - Applicazione delle Range Queries
**4.1 Preparazione delle Range Queries**

Per procedere con l'applicazione delle Range Queries, si deve prima scrivere le Queries da applicare. Per fare ciò, si costruisce un file nominato '*rqI_datasetData_Time_UniqueCode.csv*'. Ogni sommario avrà il suo file con all'interno le Range Queries correlate a ciascun dataset del sommario. Questo viene salvato in una cartella '*rangeQueriesInput*'. Il file è composto dai seguenti campi:
- datasetName --> nome del dataset su cui applicare la query in questione ('*datasetNumber*');
- numQuery --> numero identificativo della query in questione;
- queryArea --> area di query;
- minX, minY, maxX, maxY --> dimensioni della finestra di query;
- areaint --> area della query effettivamente interna al dataset.

**4.2 Effettiva applicazione delle Range Queries**

Una volta stabilite le queries, si procede con l'applicazione di quest'ultime tramite l'esecuzione dello script '*RangeQuery.py*'. Tale programma sfrutta l'indice spaziale per effettuare la query solo sulle partizioni interessate alla query stessa. Inoltre, sfrutta tecniche di parallelismo per effettuare l'analisi in contemporanea delle partizioni interessate. Al termine del processo, viene generato un file di output ('*rqR_datasetData_Time_UniqueCode.csv*'), salvato nella cartella '*rangeQueriesResult*', dove sono presenti per ciascuna query i valori risultanti di quest'ultima. Di seguito vengono riportati i valori calcolati:
- *cardinality* --> numero di geometrie nella finestra di query rapportato al numero di geometrie totali del dataset;
- *mbrTests* --> numero di confronti eseguiti sulle geometrie per l'esecuzione della query;
- *averageExecutionTime* --> tempo medio di esecuzione dei threads attivati per l'esecuzione della query;
- *numberParallelThreads* --> numero di threads instanziati per l'esecuzione della query;
- *totalExecutionTime* --> tempo totale impiegato per l'esecuzione della query (circa il prodotto tra *averageExecutionTime* e *numberParallelThreads*).

Per avviare lo script in questione, viene richiesta la compilazione del file '*rangeParameters.csv*' necessario per il corretto scambio di informazioni tra Front-end e Back-end. Questo presenta i seguenti campi:
- pathDatasets --> percorso completo contenente il dataset su cui applicare le rispettive queries ('*datasets/datasetData_Time_UniqueCode*');
- nameDataset --> nome del dataset su cui applicare le rispettive queries ('*datasetNumber.ext*');
- pathSummaries --> percorso completo contenente il sommario correlato al gruppo di datasets in cui si trova il dataset in questione ('*summaries*');
- nameSummary --> nome del sommario correlato al gruppo di datasets in cui si trova il dataset in questione ('*sum_datasetData_Time_UniqueCode.csv*');
- pathIndexes --> percorso completo contenente l'indice spaziale e le partizioni correlate al dataset in questione ('*indexes/datasetData_Time_UniqueCode/datasetNumber_spatialIndex*');
- pathRangeQueries --> percorso in cui è presente il file contenente le queries da applicare al dataset in questione ('*rangeQueriesInput*');
- nameRangeQueries --> nome del file contenente le queries da applicare al dataset in questione ('*rqI_datasetData_Time_UniqueCode.csv*').

## STEP 5 - Calcolo della dimensione frattale sui parametri risultanti delle Queries

Successivamente si procede al calcolo della dimensione frattale relative ai campi '*cardinality*', '*mbrTests*', e '*totalExecutionTime*' ricavati dall'applicazione delle queries. Per calcolare questi valori, viene usato lo script implementato nel file '*fractalDimension.py*' (files di supporto per lo scambio di informazioni Front-end <--> Back-end: '*fdParameters.csv*' e '*fdSupport.csv*'). Per procedere al corretto calcolo delle dimensioni frattali in questione, si visioni nella cartella '*fd_casi*' i files '*fdSupport_general.csv*' e '*fdSupport_caseC.csv*'.

Il calcolo corretto delle dimensioni frattali relativo a ciascun parametro selezionato, viene inserito nel file '*fd_rqR_datasetData_Time_UniqueCode.csv*' presente nella cartella '*fd*'. Questo file è composto da due righe :
- prima riga (header) --> '*cardinality;mbrTests;totalExecutionTime*';
- seconda riga (values) --> '*fd_cardinality;fd_mbrTests;fd_totalExecutionTime*'.

## STEP 6 - Studio del bilanciamento dei parametri risultanti delle Range Queries





## STEP 7 - Applicazione delle tecniche di Augmentation




## STEP 8 - Calcolo della dimensione frattale sui parametri delle Queries dopo l'Augmentation

Infine, si procede al calcolo della dimensione frattale relative ai nuovi campi '*cardinality*', '*mbrTests*', e '*totalExecutionTime*' dopo l'applicazione delle tecniche di Augmentation. Per calcolare questi valori, viene usato lo script implementato nel file '*fractalDimension.py*' (files di supporto per lo scambio di informazioni Front-end <--> Back-end: '*fdParameters.csv*' e '*fdSupport.csv*'). Per procedere al corretto calcolo delle dimensioni frattali in questione, si visioni nella cartella '*fd_casi*' i files '*fdSupport_general.csv*' e '*fdSupport_caseD.csv*'.

Il calcolo corretto delle dimensioni frattali relativo a ciascun parametro selezionato, viene inserito nel file '*fd_rqR_datasetData_Time_UniqueCode_ts.csv*' presente nella cartella '*trainingSets/datasetData_Time_UniqueCode/training_set_number*'. Questo file è composto da due righe :
- prima riga (header) --> '*cardinality;mbrTests;totalExecutionTime*';
- seconda riga (values) --> '*fd_cardinalityNew;fd_mbrTestsNew;fd_totalExecutionTimeNew*'.

#
## PROGETTO - FILE E CARTELLE

    [AIDA]
    |
    |-- [datasets]
    |   |-- [datasetDate_Time_UniqueCode]
    |       |-- commands.log
    |       |-- datasetNumber.ext
    |
    |-- [datasetsAugmentation]
    |   |-- [datasetDate_Time_UniqueCode]
    |       |-- [training_set_number]
    |           |-- datasetNumber_tecnique.ext
    |           |-- ...
    |
    |-- [fd]
    |   |-- fd_sum_datasetDate_Time_UniqueCode.csv
    |   |-- fd_rqR_datasetDate_Time_UniqueCode.csv
    |
    |-- [indexes]
    |   |-- [datasetDate_Time_UniqueCode]
    |       |-- [datasetNumber.ext]
    |           |-- master_table.csv
    |           |-- partition-number.ext
    |           |-- ...
    |
    |-- [rangeQueriesInput]
    |   |-- rqI_datasetDate_Time_UniqueCode.csv
    |
    |-- [rangeQueriesOutput]
    |   |-- rqR_datasetDate_Time_UniqueCode.csv
    |
    |-- [summaries]
    |   |-- sum_datasetDate_Time_UniqueCode.csv
    |
    |-- [trainingSets]
    |   |-- [datasetDate_Time_UniqueCode]
    |       |-- [training_set_number]
    |       |   |-- bin_datasetDate_Time_UniqueCode_ts.csv
    |       |   |-- fd_rqR_datasetDate_Time_UniqueCode_ts.csv
    |       |   |-- fd_rqR_datasetDate_Time_UniqueCode.csv
    |       |   |-- input.csv
    |       |   |-- new_dataset.csv
    |       |   |-- rqR_datasetDate_Time_UniqueCode_ts.csv
    |       |   |-- sum_datasetDate_Time_UniqueCode_ts.csv
    |       |
    |       |-- [training_set_number_diff]
    |
    |-- augmentation.py
    |-- augmentationParameters.csv
    |-- fdParameters.csv
    |-- fdSupport.csv
    |-- fractalDimension.py
    |-- Generator.py
    |-- GeneratorCSV.py
    |-- Indexing.py
    |-- indexParameters.csv
    |-- rank_with_diff.py
    |-- rankParameters.csv
    |-- rangeParameters.csv
    |-- RangeQuery.py
