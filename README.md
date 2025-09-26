# AIDA: A Spatial Data Augmentation Tool for Machine Learning Dataset Preparation

## CARTELLE:
**datasets** --> cartella contenente tutti i datasets generati, divisi in cartelle in base a come sono stati generati.

          - nomi cartelle: "datasetsData_Time_UniqueCode"; --> cartella contenente i datasets generati in "Data", "Time" con "UniqueCode"
          - nomi file: "datasetNumber.extension".          --> file contenente le geometrie di "datasetNumber" (extension: ".csv" o ".wkt")

**fd** --> cartella contenente tutti i file con le dimensioni frattali (?). I nomi dei file, dipendono dalla cartella dataset corrispondente.

          - nomi file: "fd_sum_datasetsData_Time_UniqueCode.csv"; --> file contenente l'esito delle dimensioni frattali su "avg_area", "avg_side_length_0", "avg_side_length_1"
                       "fd_rqR_datasetsData_Time_UniqueCode.csv". --> file contenente l'esito delle dimensioni frattali su "cardinality", "executionTime", "mbrTests"

**indexes** --> cartella contenente gli indici spaziali generati corrsipondenti a ciascun dataset, divisi in cartelle.

          - nomi cartelle L.1: "datasetsData_Time_UniqueCode"; --> cartella contenente gli indici spaziali dei datasets generati in "Data", "Time" con "UniqueCode"
          - nomi cartelle L.2: "datasetNumber_spatialIndex";   --> cartella contenente l'indice spaziale di "datasetNumber"
          - nomi file: "part-number.csv";                      --> file contenente le geometrie della partizione "number"
                       "_master.rsgrove".                      --> file contenente un recap delle singole partizioni generate con info su ciascuna

**rangeQueriesInputs** --> cartella contenente i file con le Range Queries da applicare.

          - nomi file: "rqI_datasetsData_Time_UniqueCode.csv". --> file contenente le Range Queries da applicare al gruppo di datasets generati in "Data", "Time" con "UniqueCode"

**rangeQueriesResult** --> cartella contenente i file con i risultati delle Range Queries ("cardinality", "executionTime", "mbrTests").

          - nomi file: "rqR_datasetsData_Time_UniqueCode.csv". --> file contenente gli esiti delle Range Queries del gruppo di datasets generati in "Data", "Time" con "UniqueCode"

**src** --> cartella contenente due script fondamentali per il processo di Augmentation. Inseriti nel seguente modo per l'uso di SBT.

**summaries** --> cartella contenente i file con le principali caratteristiche dei dataset.

          - nomi file: "sum_datasetsData_Time_UniqueCode.csv". --> file contenente le caratteristiche del gruppo di datasets generati in "Data", "Time" con "UniqueCode"

**trainingSets** --> cartella contenente tutti i training set divisi per ciascun gruppo di dataset.

          - nomi cartelle L.1: "datasetsData_Time_UniqueCode";
          - nomi cartelle L.2: "training_set_number" e "training_set_number_diff";
          - nomi file: "bin_datasetsData_Time_UniqueCode_ts.csv";    --> bin associati al parametro categorizzato
                       "fd_sum_datasetsData_Time_UniqueCode.csv";    --> dimensioni frattali sui parametri "avg_area", "avg_side_length_0", "avg_side_length_1"
                       "fd_rqR_datasetsData_Time_UniqueCode.csv";    --> dimensioni frattali sui parametri "cardinality", "executionTime", "mbrTests" (prima "augmentation")
                       "fd_rqR_datasetsData_Time_UniqueCode_ts.csv"; --> dimensioni frattali sui parametri "cardinality", "executionTime", "mbrTests" (dopo "augmentation")
                       "input.csv";                                  --> file di input dell'utente con specifiche sull'applicazione di "augmentation"
                       "rqR_datasetsData_Time_UniqueCode_ts.csv";    --> risultati delle Range Queries correlate al gruppo di dataset in analisi
                       "sum_datasetsData_Time_UniqueCode_ts.csv";    --> principali caratteristiche dei dataset in analisi
                       "new_datasets.csv".                           --> principali caratteristiche dei nuovi dataset generati con le tecniche di augmentation

## SCRIPT
**generator.py - generator.sh** --> script col compito di generare i dataset presenti in "summaries/sum_datasetsData_Time_UniqueCode.csv".

**indexApp.scala** --> script che genera gli indici spaziali del gruppo di dataset richiesti (input file: "indexParameters.csv").

**rangeQueryApp.scala** --> script che effettua le range queries correlate al dataset richiesto (input file: "rangeParameters.csv").

**rank_with_diff.py** --> script che genera i bin del parametro scelto da categorizzare (input file: "rankParameters.csv").

**augmentation.py** --> script che applica le tecniche di augmentation sul gruppo di dataset in analisi (input file: "augmentationParameters.csv").

**fractalDimension.py** --> script che calcola le dimensioni spaziali su parametri passati dall'utente (input file: "fdParameters.csv").

## FILE PER L'USO DEGLI SCRIPT
**indexParameters.csv** --> header: "pathDatasets;nameDataset;pathIndexes;typePartition;num"

          - pathDatasets = cartella in cui trovare il dataset da partizionare ("datasets/datasetsData_Time_UniqueCode");
          - nameDataset = nome del dataset da partizionare ("datasetNumber.extension");
          - pathIndexes = cartella in cui salvare l'indice spaziale ("indexes");
          - typePartition = tipo di partizionamento possibile ("partitions", "geometries" o "bits");
          - num = numero correlato al tipo di partizionamento scelto ("number_partitions", "number_geometries" o "number_bits").

**rangeParameters.csv** --> header: "pathDatasets;nameDataset;pathSummaries;nameSummary;pathIndexes;pathRangeQueries;nameRangeQueries"

          - pathDatasets = cartella in cui trovare il dataset selezionato ("datasets/datasetsData_Time_UniqueCode");
          - nameDataset = nome del dataset selezionato ("datasetNumber.extension");
          - pathSummaries = cartella in cui trovare i sommari dei datasets ("summaries");
          - nameSummary = file in cui trovare il sommario del dataset selezionato ("sum_datasetsData_Time_UniqueCode.csv");
          - pathIndexes = cartella in cui trovare l'indice spaziale del dataset selezionato ("indexes/datasetsData_Time_UniqueCode/datasetNumber_spatialIndex");
          - pathRangeQueries = cartella in cui trovare le range queries correlate al dataset selezionato ("rangeQueriesInputs");
          - nameRangeQueries = file in cui trovare le range queries correlate al dataset selezionato ("rqI_datasetsData_Time_UniqueCode.csv").

**rankParameters.csv** --> header: "parameterCategorized;numberIntervals;pathRangeQueriesResult;nameRangeQueriesResult;pathSummaries;nameSummary;pathFD;nameFD"

          - parameterCategorized = parametro che si vuole categorizzare ("cardinality", "executionTime" o "mbrTests");
          - numberIntervals = numero di intervalli che si vogliono generare ("number");
          - pathRangeQueriesResult = cartella in cui trovare i risultati delle range queries ("rangeQueriesResult");
          - nameRangeQueriesResult = file in cui trovare i risultati delle range queries ("rqR_datasetsData_Time_UniqueCode.csv");
          - pathSummaries = cartella in cui trovare i sommari dei datasets ("summaries");
          - nameSummary = file in cui trovare il sommario del dataset selezionato ("sum_datasetsData_Time_UniqueCode.csv");
          - pathFD = cartella in cui trovare i file correlati agli indici spaziali ("fd");
          - nameFD = nomi dei file da inserire all'inetrno del training set correlati agli indici spaziali ("fd_sum_datasetsData_Time_UniqueCode.csv;fd_rqR_datasetsData_Time_UniqueCode.csv").

**augmentationParameters.csv** --> header: "pathTrainingSet;nameBin;nameSummary;nameRangeQueriesResult;nameInputs;pathDatasets;pathIndexes"

          - pathTrainingSet = cartella contenente l'insieme di file utili per l'augmentation del set scelto ("trainingSets/datasetsData_Time_UniqueCoede/training_set_number");
          - nameBin = file contenente i bin relativi al set scelto ("bin_datasetsData_Time_UniqueCode_ts.csv");
          - nameSummary = file contenente il sommario dei datasets appartenenti al set scelto ("sum_datasetsData_Time_UniqueCode_ts.csv");
          - nameRangeQueriesResult = file contenente i risultati delle range queries correlate al set scelto ("rqR_datasetsData_Time_UniqueCode_ts.csv");
          - nameInputs = file contenente gli input dell'utente ("input.csv");
          - pathDatasets = cartella contenente i datasets relativi al set selezionato ("datasets/datasetsData_Time_UniqueCode");
          - pathIndexes = cartella contenente gli indici spaziali dei datasets relativi al set selezionato ("indexes/datasetsData_Time_UniqueCode").

**fdParameters.csv** --> header: "pathDatasets;pathSummary;nameSummary;pathRangeQuery_ts;nameRangeQuery_ts;fromX;toX;pathFD;pathFD_ts;parameters"

          - pathDatasets = cartella contenente i datasets generati ("datasets/datasetsData_Time_UniqueCode");
          - pathSummary = cartella contenente i sommari dei datasets ("summaries");
          - nameSummary = file contenente il sommario dei datasets richiesti ("sum_datasetsData_Time_UniqueCode.csv");
          - pathRangeQuery_ts = cartella contenente le range queries ("rangeQueriesResult" o "trainingSets/datasetsData_Time_UniqueCode/training_set_number");
          - nameRangeQuery_ts = file contenente le range queries richieste ("rqR_datasetsData_Time_UniqueCode.csv");
          - fromX = numero dataset da cui partire ("number");
          - toX = numero ultimo dataset ("number");
          - pathFD = dove salvare il risultato del calcolo della dimensione frattale ("fd");
          - pathFD_ts = dove salvare il risultato del calcolo della dimensione frattale ("trainingSets/datasetsData_Time_UniqueCode/training_set_number" o "fd");
                         
                         parameters = parametri su cui calcolare la dimensione frattale ("distribution", "avg_area", "avg_side_length_0", "avg_side_length_1", "cardinality", "executionTime" o "mbrTests").
