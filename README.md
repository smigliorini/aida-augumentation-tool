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
