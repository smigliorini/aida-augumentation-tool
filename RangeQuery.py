import os
import time
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from multiprocessing import cpu_count
from rtree import index
from shapely.geometry import box
from shapely.wkt import loads

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'analyze_csv':
def analyze_csv(file_path):

	"""
	Funzione che passato in ingresso un file '.csv', restituisce un DataFrame con le colonne del file in ingresso (le colonne
	sono "pathDatasets", "nameDataset", "pathSummaries", "nameSummary", "pathIndexes", "pathRangeQueries", "nameRangeQueries"):
	--> PARAMETRI IN INGRESSO: percorso del file (filePath);
	--> PARAMETRI IN USCITA: DataFrame con ciascuna riga un dataset composta da (["pathDatasets", "nameDataset", "pathSummaries",
							 "nameSummary", "pathIndexes", "pathRangeQueries", "nameRangeQueries"]).
	"""

	df = pd.read_csv(file_path, sep=';')
	expected = ["pathDatasets", "nameDataset", "pathSummaries", "nameSummary", "pathIndexes", "pathRangeQueries", "nameRangeQueries"]
	if df.columns.tolist() != expected:
		raise ValueError(f"<System> ERROR: the CSV header expected is '{expected}'...")
	return df

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'get_geometry':
def get_geometry(dataset_name, folder_summaries, name_summaries):
	
	"""
	Funzione che restituisce il tipo di geometria contenuto nel dataset in analisi.
	--> PARAMETRI IN INGRESSO: nome del dataset in analisi (dataset_name);
							   cartella contenente i sommari dei dataset (folder_summaries);
							   nome del sommario che contiene il dataset in analisi (name_summaries).
	--> PARAMETRI IN USCITA: geometria presente nel dataset in analisi.
	"""
	
	path_summaries = os.path.join(folder_summaries, name_summaries)										# Costruzione: summaries + sum_datasetsData_Time_UniqueCode.csv --> summaries/sum_datasetsData_Time_UniqueCode.csv
	if not os.path.isfile(path_summaries):																# Se il file non esiste...
		raise FileNotFoundError(f"<System> The file '{name_summaries}' does not exist!")				# ... mando un messaggio di errore!

	df = pd.read_csv(path_summaries, sep=';')															# Apertura del file e relativo salvataggio

	required_cols = {"datasetName", "geometry"}															# Colonne necessarie per la ricerca della geometria
	if not required_cols.issubset(df.columns):															# Verifica dell'esistenza delle colonne richieste
		raise ValueError(f"<System> Columns '{required_cols}' not found in '{name_summaries}'.")
	
	row = df.loc[df["datasetName"] == dataset_name]														# Filtro la riga relativa al datset in questione

	if row.empty:																						# Verifico dell'effettiva esistenza del dataset in questione
		raise ValueError(f"<System> The dataset '{dataset_name}' not found in '{name_summaries}'.")
	
	return row.iloc[0]["geometry"]

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'analysis_output_file':
def analysis_output_file(output_filePath, dataset_name):
	
	"""
	Funzione che analizza il file di output lasciando solo le righe diverse dal dataset in analisi.
	Se il file non esiste, viene generato con l'header richiesto.
	--> PARAMETRI IN INGRESSO: percorso in cui salvare gli esiti delle range queries (output_filePath);
							   nome del dataset in questione (dataste_name).
	"""
	
	header_cols = ["datasetName", "numQuery", "queryArea",	"minX", "minY", "maxX", "maxY",	"areaint", "cardinality", "mbrTests", "averageExecutionTime", "numberParallelThreads", "totalExecutionTime"]
	if os.path.isfile(output_filePath):
		df_out = pd.read_csv(output_filePath, sep=';')					# Leggo il CSV esistente
		df_out = df_out[df_out["datasetName"] != dataset_name]			# Filtro tutte le righe che NON iniziano con il nome del dataset in questione
	else:
		df_out = pd.DataFrame(columns=header_cols)						# Creazione di un DataFrame vuoto con solo l'header
	df_out.to_csv(output_filePath, sep=';', index=False)				# Riscrivo il file con il contenuto filtrato o con l’header se nuovo


# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'analyze_rangeQueries':
def analyze_rangeQueries(file_path, dataset_name):

	"""
	Funzione che passato in ingresso un file '.csv' contenente le range queries, restituisca quelle relative al dataset in analisi
	(colonne del file: "datasetName", "numQuery", "queryArea", "minX", "minY", "maxX", "maxY", "areaint").
	--> PARAMETRI IN INGRESSO: percorso del file (file_path);
							   nome del dataset in analisi (dataset_name).
	--> PARAMETRI IN USCITA: DataFrame con ciascuna riga una query legata al dataset in analisi (["datasetName", "numQuery", "queryArea",
							 "minX", "minY", "maxX", "maxY", "areaint"]).
	"""

	expected = ["datasetName", "numQuery", "minX", "minY", "maxX", "maxY"]						# Seleziono le sole colonne che mi interessano
	chunks = pd.read_csv(file_path, sep=';', usecols=expected, chunksize=100_000)				# Leggo a chunk di 100000 righe il file
	df = pd.concat(chunk[chunk["datasetName"] == dataset_name] for chunk in chunks)				# Unisco filtrando per nome del dataset
	if df.columns.tolist() != expected:															# Se l'header è sbagliato, mando un errore!
		raise ValueError(f"<System> ERROR: the CSV header expected is '{expected}'...")
	return df																					# Restituisco il DataFrame

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'MBR_values':
def MBR_values(summary_filePath, dataset_name):

	"""
	Funzione che, passato il dataset in questione, restituisca il valore della finestra di dataset e
	il numero totali di geometrie appartenenti al dataset in questione.
	--> PARAMETRI IN INGRESSO: percorso del file contenente il sommario dei dataset (summary_filePath);
							   nome del dataset in questione (dataset_name).
	--> PARAMETRI IN USCITA: valori della finestra di dataset e numero totali di geometrie nel dataset.
	"""

	df = pd.read_csv(summary_filePath, sep=';')							# Leggo il sommario
	dataset = df.loc[df["datasetName"] == dataset_name]					# Filtro la riga con il solo nome del dataset in questione
	if dataset.empty:													# Se non ho trovato il dataset, mando un messaggio di errore
		raise ValueError(f"<System> Dataset '{dataset_name}' not found in summary file.")
	return (
		float(dataset.iloc[0]["x1"]),
		float(dataset.iloc[0]["y1"]),
		float(dataset.iloc[0]["x2"]),
		float(dataset.iloc[0]["y2"]),
		int(dataset.iloc[0]["num_features"])
	)

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'load_master_table':
def load_master_table(folder):

	"""
	Funzione che costruisce una lista contenente le informazioni principali sulle partizioni
	del dataset in questione, partendo dalla master_table associata all'indice spaziale.
	--> PARAMETRI IN INGRESSO: path della cartella contenente partizioni e master_table (folder).
	--> PARAMETRI IN USCITA: lista di partizioni con le seguenti informazioni {path_partition, bound_partition};
	"""

	df = pd.read_csv(os.path.join(folder, "master_table.csv"))					# DataFrame contenente la master_table
	required_cols = {"NamePartition", "xMin", "yMin", "xMax", "yMax"}			# Colonne necessarie per la costruzione della lista in questione
	if not required_cols.issubset(df.columns):									# Se le colonne non sono presenti, mando un messaggio di errore
		raise ValueError("<System> Master table missing required columns")

	partition_files = []														# Lista che conterrà le partizioni come {path_partition, bound_partition}
	for row in df.itertuples(index=False):										# Scorro le singole partizioni presenti nella master_table e...
		partition_files.append({												# ... per ciascuna salvo nella lista:
			"path": os.path.join(folder, row.NamePartition),					# Percorso in cui si trova la partizione
			"bounds": (row.xMin, row.yMin, row.xMax, row.yMax)					# Bounding Box della partizione
		})

	return partition_files

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'build_partition_index':
def build_partition_index(partition_files):

	"""
	Funzione che costruisce un R-tree globale usato per individuare velocemente quali partizioni
	sono potenzialmente rilevanti per una query selezionata.
	--> PARAMETRI IN INGRESSO: lista dei file partizione del dataset con le loro Bounding Box, composta da 'path' e 'bounds' (partition_files).
	--> PARAMETRI IN USCITA: R-Tree costruito (partition_index).
	"""

	partition_index = index.Index()						# RTree_globale
	for pid, part in enumerate(partition_files):		# Ciclo su ciascuna partizione
		partition_index.insert(pid, part["bounds"])		# Inserimento della partizione in questione nell'RTree globale (codice della partizione e relativa Bounding Box)
	return partition_index

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'load_partition':
def load_partition(partition, geometry_type):

	"""
	Funzione che carica le partizioni di un dataset e genera un RTree locale per ciascuna partizione
	(per velocizzare le query sulle geometrie all'interno della partizione).
	--> PARAMETRI IN INGRESSO: file partizione con sua Bounding Box, composta da 'path' e 'bounds' (partition);
							   tipo di geometria contenuta nella partizione (Point, Box, Polygon).
	--> PARAMETRI IN USCITA: lista contenente le geometrie della partizione in questione (geometries);
							 RTree locale delle geometrie della partizione contenente le rispettive BoundingBox (idx);
							 numero totale di geometrie appartenenti alla partizione in questione (count_geom).
	"""

	df = pd.read_csv(partition["path"])												# Caricamento effettivo della singola partizione in questione
	partition_box = box(*partition["bounds"])										# Box che rappresenta i bordi della partizione in questione
	geometries = []																	# Lista che conterrà le singole geometrie della partizione in questione
	count_geom = 0																	# Variabile che conta il numero di geometrie totali della partizione in questione
	geometry_type = geometry_type.lower()											# Tipo di geometria scritto tutto in minuscolo
	if geometry_type == "point":													# Le geometrie della partizione in questione sono POINT:
		for (x, y) in df.itertuples(index=False, name=None):						# Scorro le singole geometrie della partizione in questione
			count_geom += 1															# Incremento del contatore delle geometrie della partizione
			geom = box(x, y, x, y)													# Genero una box 'degenerata' per rappresentare il punto
			if partition_box.covers(geom):											# Se la geometria è interamente all'interno della partizione (bordi compresi)...
				geometries.append(geom)												# ... la inserisco nelle geometrie della partizione in questione
	elif geometry_type == "box":													# Le geometrie della partizione in questione sono BOX:
		for (x1, y1, x2, y2) in df.itertuples(index=False, name=None):				# Scorro le singole geometrie della partizione in questione
			count_geom += 1															# Incremento del contatore delle geometrie della partizione
			geom = box(x1, y1, x2, y2)												# Genero la box correlata alla geometria in questione
			if partition_box.contains(geom) or partition_box.covers(geom.centroid):	# Se la geometria è interamente all'interno della partizione o lo è il suo centroide...
				geometries.append(geom)												# ... la inserisco nelle geometrie della partizione in questione
	elif geometry_type == "polygon":												# Le geometrie della partizione in questione sono POLYGON:
		for (wkt,) in df.itertuples(index=False, name=None):						# Scorro le singole geometrie della partizione in questione
			count_geom += 1															# Incremento del contatore delle geometrie della partizione
			geom = loads(wkt)														# Parsing da WKT a poligono della geometria in questione
			if partition_box.contains(geom) or partition_box.covers(geom.centroid):	# Se la geometria è interamente all'interno della partizione o lo è il suo centroide...
				geometries.append(geom)												# ... la inserisco nelle geometrie della partizione in questione
	else:																			# Se la geometria non è riconosciuta...
		raise ValueError(f"<System> Unknown geometry type '{geometry_type}'.")		# ... viene lanciato un messaggio di errore!

	# Costruzione di un RTree locale (permette di fare "intersection queries" più veloci sulla partizione senza scansionare tutte le geometrie)
	idx = index.Index()
	for i, geom in enumerate(geometries):											# Ciclo su tutte le geometrie appartenenti alla partizione in qiestione
		idx.insert(i, geom.bounds)													# Inserimento nell'RTree della Bounding Box della geometria selezionata

	return geometries, idx, count_geom

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'application_query':
def application_query(range_bounds, partitions, partition_index, geometry_type, total_geometries):

	"""
	Funzione che effettua la query in questione sul dataset in questione, sfruttandone le partizioni del dataset.
	--> PARAMETRI IN INGRESSO: dimensioni della finestra di query in questione (range_bounds);
							   partizioni appartenenti al dataset in questione (partitions);
							   RTree globale relativo alle partizioni del dataset in questione (partition_index);
							   numero totale di geometrie appartenenti al dataset in questione (tot_geom).
	--> PARAMETRI IN USCITA: numero di geometrie presenti nella finestra di query rapportate al numero totale di geometrie nel dataset (cardinality);
							 test svolti sulle geometrie del dataset per analizzare la query in questione (mbr_tests);
							 tempo medio di lavorazione di ciascun thread (avarage_execution_time);
							 numero di thread eseguiti per l'analisi della query in questione (number_parallel_threads);
							 tempo di esecuzione totale della query in questione (total_execution_time).
	"""

	query_box = box(*range_bounds)														# Creo la box corrispondente alla finestra di query in questione
	start_time = time.perf_counter()													# Avvio del cronometro
	mbr_tests = 0																		# Variabile contatore che servirà a tenere conto degli MBR tests (partizioni + geometrie)
	matches = 0																			# Numero di geometrie che soddisfano la query in questione
	candidate_partition_ids = list(partition_index.intersection(query_box.bounds))		# Filtro le sole partizioni che intersecano la finestra di query in questione
	
	# Se ci sono meno di 4 partizioni da analizzare si procede con l'algoritmo sequenziale:
	if len(candidate_partition_ids) < 4:
		print(f"<System>           Number of partitions to analyze: {len(candidate_partition_ids)}. Algorithm used: SEQUENTIAL!")
		for pid in candidate_partition_ids:
			part = partitions[pid]															# Raccolgo i dati della partizione in questione (Bounding Box, Geometrie della partizione, RTree interno alla partizione)
			geometries, local_index, geom_partition = load_partition(part, geometry_type)	# Caricamento delle geometrie correlate alla partizione in questione (e RTree)
			mbr_tests += geom_partition														# Aggiorno il contatore degli MBR tests aggiungendo il numero totale di geometrie interne alla partizione in questione

			local_candidates = list(local_index.intersection(query_box.bounds))				# Isolo le sole geometrie che hanno MBR compatibili alla finestra di query in questione
			for cid in local_candidates:													# Ciclo sulle sole geometrie che appartengono alla finestra di query in questione
				if geometries[cid].intersects(query_box):									# Vedo se effettivamente la geometria interseca la finestra di query in questione
					matches += 1															# Se si, incremento la variabile contatrice
	
		cardinality = matches / total_geometries if total_geometries > 0 else 0				# Calcolo la cardinalità effettiva
		number_parallel_threads = 1															# Numero di threads paralleli eseguiti (1 nel caso sequenziale)
		total_execution_time = int((time.perf_counter() - start_time) * 1000)				# Calcolo il tempo impiegato in ms
		total_time_threads = total_execution_time											# Tempo totale di esecuzione della range query in questione
		average_execution_time = total_execution_time										# Calcolo del tempo medio dei singoli thread
		print(f"<System>           Time taken: {total_execution_time} ms")

	# Altrimenti, se ci sono almeno 4 partizioni da analizzare, si procede con l'algoritmo parallelo:
	else:
		print(f"<System>           Number of partitions to analyze: {len(candidate_partition_ids)}. Algorithm used: PARALLEL!")
		thread_times = []																	# Tempi di esecuzione dei singoli thread
		max_workers = (																		# Definizione del numero di Worker da far lavorare
			min(cpu_count(), len(candidate_partition_ids))
			if len(candidate_partition_ids) != 0 else 1
		)

		# Applicazione della query in questione su ciascuna partizione interessata
		with ThreadPoolExecutor(max_workers=max_workers) as executor:						# Esecuzione in MultiThreads della range query sulle partizioni candidate
			futures = [
				executor.submit(
					process_partition,														# Nome della funzione da eseguire in parallelo
					partitions[pid],														# Bounding Box, Geometrie e RTree interno della partizione in questione
					geometry_type,															# Tipo di geometria della partizione in questione
					query_box																# Bounding Box della query in questione
				)
				for pid in candidate_partition_ids
			]

			for future in as_completed(futures):											# Per ogni risultato ritornato...
				m, mbr, t = future.result()													# ... carico il ritorno effettivo delle funzioni
				matches += m																# Aggiorno "matches"
				mbr_tests += mbr															# Aggiorno "mbr_tests"
				thread_times.append(t)														# Aggiorno la lista di tempi di esecuzione dei vari thread
	
		number_parallel_threads = len(thread_times)											# Numero di threads paralleli eseguiti (che dovrebbero essere pari al numero di partizioni analizzate)
		total_time_threads = sum(thread_times)												# Tempo totale di esecuzione della range query in questione
		average_execution_time = int(														# Calcolo del tempo medio dei singoli thread
			sum(thread_times) / number_parallel_threads
			if number_parallel_threads > 0 else 0
		)
		cardinality = matches / total_geometries if total_geometries > 0 else 0				# Calcolo la cardinalità effettiva
		total_execution_time = int((time.perf_counter() - start_time) * 1000)				# Calcolo il tempo impiegato in ms
		print(f"<System>           Time taken: {total_execution_time} ms")

	return cardinality, mbr_tests, average_execution_time, number_parallel_threads, total_time_threads

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'process_partition':
def process_partition(part, geometry_type, query_box):
	
	"""
	Funzione che restituisce l'effettivo calcolo della query sulla singola partizione in questione
	--> PARAMETRI IN INGRESSO: Bounding Box, Geometrie e RTree interno della partizione in questione (part);
							   tipo di geometria della partizione in questione (geometry_type);
							   Bounding Box della query in questione (query_box).
	--> PARAMETRI IN USCITA: numero di geometrie appartenenti alla partizione in questione che soddisfano la query in questione (matches);
							 test svolti sulle geometrie della partizione in questione per analizzare la query in questione (mbr_tests);
							 tempo di esecuzione del thread (total_time_processPartition).
	"""
	
	start_processPartition = time.perf_counter()
	geometries, local_index, mbr_tests = load_partition(part, geometry_type)					# Caricamento delle geometrie correlate alla partizione in questione (e RTree )
	matches = 0																					# Numero di geometrie appartenenti alla partizione in questione che soddisfano la query in questione
	local_candidates = list(local_index.intersection(query_box.bounds))							# Isolo le sole geometrie che hanno MBR compatibili alla finestra di query in questione
	for cid in local_candidates:																# Ciclo sulle sole geometrie che appartengono alla finestra di query in questione
		if geometries[cid].intersects(query_box):												# Vedo se effettivamente la geometria interseca la finestra di query in questione
			matches += 1																		# Se si, incremento la variabile contatrice
	total_time_processPartition = int((time.perf_counter() - start_processPartition)) * 1000

	return matches, mbr_tests, total_time_processPartition





def main():
	file_input = "rangeParameters.csv"															# File "".csv" contenente gli input
	print(f"<System> Starting the reading process for file '{file_input}'!")
	start_time_analysisInputFile = time.perf_counter()
	if not os.path.exists(file_input):															# Verifica dell'esistenza del file 'rangeParameters.csv'
		raise ValueError(f"<System> ERROR: The file '{file_input}' does not exist!")
	df = analyze_csv(file_input)																# Richiamo una funzione che analizzi gli input del file e restituisca un DataFrame
	"""
	try:																						# Eliminazione del file 'rangeParameters.csv' con verifica
		os.remove(file_input)
		print(f"<System> The file '{file_input}' has been successfully deleted!")
	except Exception as e:
		print(f"<System> Unable to delete file '{file_input}'! Error: {e}")
	"""
	total_time_analysisInputFile = float(time.perf_counter() - start_time_analysisInputFile)
	print(f"<System>      Time taken: {total_time_analysisInputFile:.6f} s")

	for row in df.itertuples(index=False):														# Esecuzione di tutte le Range Queries richieste dall'utente
		print()
		print(f"<System> Starting the range queries process for '{row.nameDataset}'!")

		# 1. Costruzione dei principali percorsi utili --------------------------------------------------------------------------
		dataset_last = os.path.basename(row.pathDatasets)										# Costruzione: datasets/datasetsData_Time_UniqueCode --> datasetsData_Time_UniqueCode
		output_fileName = f"rqR_{dataset_last}.csv"												# Costruzione: datasetsData_Time_UniqueCode --> rqR_datasetsData_Time_UniqueCode.csv
		output_filePath = os.path.join("rangeQueriesResult", output_fileName)					# Costruzione: rangeQueriesResult + rqR_datasetsData_Time_UniqueCode.csv --> rangeQueriesResult/rqR_datasetsData_Time_UniqueCode.csv
		output_fileDir = os.path.dirname(output_filePath)										# Costruzione: rangeQueriesResult/rqR_datasetsData_Time_UniqueCode.csv --> rangeQueriesResult
		if not os.path.exists(output_fileDir):													# Se la directory non esiste...
			os.makedirs(output_fileDir)															# ... viene generata
		rangeQueries_filePath = os.path.join(row.pathRangeQueries, row.nameRangeQueries)		# Costruzione: rangeQueriesInputs + rqI_datasetsData_Time_UniqueCode.csv --> rangeQueriesInputs/rqI_datasetsData_Time_UniqueCode.csv
		dataset_name = row.nameDataset.removesuffix(".csv").removesuffix(".wkt")				# Costruzione: datasetNumber.ext --> datasetNumber
		dataset_filePath = os.path.join(row.pathSummaries, row.nameSummary)						# Costruzione: summaries + sum_datasetsData_Time_UniqueCode.csv --> summaries/sum_datasetsData_Time_UniqueCode.csv
		d_minX, d_minY, d_maxX, d_maxY, tot_geom = MBR_values(dataset_filePath, dataset_name)	# Calcolo dei valori di finestra del dataset in questione e numero di geometrie totali appartenenti al dataset in questione
		buffer = []																				# Imposto un buffer per il salvataggio dei risultati delle queries relative al dataset in questione
		buffer_size = 250																		# Dimensione massima del buffer oltre il cui vengono salvati i risultati sulle queries

		# 2. Cerco il tipo di geometrie contenute nel dataset in analisi --------------------------------------------------------
		start_time_getGeometry = time.perf_counter()
		try:
			geometry = get_geometry(dataset_name, row.pathSummaries, row.nameSummary)
		except ValueError as e:
			print(f"<System> Dataset geometry type lookup failed for '{dataset_name}'. Error: {e}")
			continue
		print(f"<System> The dataset you want to analyze is '{dataset_name}'. His geometry is '{geometry}'.")
		total_time_getGeometry = float(time.perf_counter() - start_time_getGeometry)
		print(f"<System>      Time taken: {total_time_getGeometry:.6f} s")


		# 3. Analisi del file di output -----------------------------------------------------------------------------------------
		print(f"<System> Output file analysis for dataset '{dataset_name}'.")
		start_time_analysisOutputFile = time.perf_counter()
		analysis_output_file(output_filePath, dataset_name)
		total_time_analysisOutputFile = float(time.perf_counter() - start_time_analysisOutputFile)
		print(f"<System>      Time taken: {total_time_analysisOutputFile:.6f} s")

		# 4. Analisi del file contenente le range queries -----------------------------------------------------------------------
		print(f"<System> Analysis of the '{row.nameRangeQueries}' file with reference to the '{dataset_name}'.")
		start_time_analyzeRangeQueries = time.perf_counter()
		rangeQueries_df = analyze_rangeQueries(rangeQueries_filePath, dataset_name)								# Funzione che mi restituisce un DataFrame contenente le sole righe di queries interessate al dataset in analisi
		rangeQueries_df = rangeQueries_df.astype({"minX": float, "minY": float, "maxX": float, "maxY": float})	# Tipizzazione dei valori trovati
		total_time_analyzeRangeQueries = float(time.perf_counter() - start_time_analyzeRangeQueries)
		print(f"<System>      Time taken: {total_time_analyzeRangeQueries:.6f} s")

		# 5. Analisi della Master Table relativa al dataset in questione --------------------------------------------------------
		print(f"<System> Analysis of the Master Table file with reference to the '{dataset_name}'.")
		start_time_loadMasterTable = time.perf_counter()
		partition_files = load_master_table(row.pathIndexes)
		partition_index = build_partition_index(partition_files)
		total_time_loadMasterTable = float(time.perf_counter() - start_time_loadMasterTable)
		print(f"<System>      Time taken: {total_time_loadMasterTable:.6f} s")

		# 6. Esecuzione delle singole range queries legate al dataset in questione ----------------------------------------------
		print(f"<System> Analysis of the {len(rangeQueries_df)} range queries relating to the '{dataset_name}'.")
		start_time_applicationRangeQueries = time.perf_counter()
		for rq_row in rangeQueries_df.itertuples(index=False):
			print(f"<System>      Analysis of the range query '{rq_row.numQuery}' of the '{row.nameRangeQueries}' file.")

			# Calcolo dell'area effettiva di query, che rientra nella finestra del dataset in questione
			int_minX = max(rq_row.minX, d_minX)											# Prendo il valore massimo tra limite di query e limite di dataset (minX)
			int_minY = max(rq_row.minY, d_minY)											# Prendo il valore massimo tra limite di query e limite di dataset (minY)
			int_maxX = min(rq_row.maxX, d_maxX)											# Prendo il valore minimo tra limite di query e limite di dataset (maxX)
			int_maxY = min(rq_row.maxY, d_maxY)											# Prendo il valore minimo tra limite di query e limite di dataset (maxY)
			range_bounds = (rq_row.minX, rq_row.minY, rq_row.maxX, rq_row.maxY)			# Range relativi alla finestra di query in questione
			area_int = (int_maxX - int_minX) * (int_maxY - int_minY)					# Area di query effettiva interna al dataset
			if area_int < 0:															# Se la query è esterna alla finestra del dataset in questione...
				area_int = 0															# ... l'area di query è zero
			query_area = (rq_row.maxX - rq_row.minX) * (rq_row.maxY - rq_row.minY)		# Calcolo area della query in questione

			# Calcolo dei parametri risultati della query e del dataset selezionati
			cardinality, mbr_tests, avarage_execution_time, number_parallel_threads, total_execution_time = application_query(range_bounds, partition_files, partition_index, geometry, tot_geom)

			# Aggiungo il risultato della query in questione al buffer di salvataggio
			buffer.append({
				"datasetName": dataset_name,
				"numQuery": rq_row.numQuery,
				"queryArea": query_area,
				"minX": rq_row.minX,
				"minY": rq_row.minY,
				"maxX": rq_row.maxX,
				"maxY": rq_row.maxY,
				"areaint": area_int,
				"cardinality": cardinality,
				"mbrTests": mbr_tests,
				"averageExecutionTime": avarage_execution_time,
				"numberParallelThreads": number_parallel_threads,
				"totalExecutionTime": total_execution_time
			})

			# Se il buffer è abbastanza pieno, procedo al salvataggio dei risultati e svuoto il buffer
			if len(buffer) >= buffer_size:
				pd.DataFrame(buffer).to_csv(						# Creo un DataFrame partendo dal buffer e lo stampo su un ".csv"
					output_filePath,								# Salvo su questo file
					sep=';',										# Carattere separatore
					mode='a',										# Aggiungi in fondo al file
					header=False,									# L'header non viene scritto
					index=False										# Non scrive l'indice numerico riferito a ciascuna riga del buffer
				)
				buffer.clear()										# Pulizia del buffer

		# Se terminata l'analisi del dataset il buffer ha ancora dei risultati al suo interno, procedo al loro salvataggio e svuoto il buffer
		if buffer:
			pd.DataFrame(buffer).to_csv(						# Creo un DataFrame partendo dal buffer e lo stampo su un ".csv"
				output_filePath,								# Salvo su questo file
				sep=';',										# Carattere separatore
				mode='a',										# Aggiungi in fondo al file
				header=False,									# L'header non viene scritto
				index=False										# Non scrive l'indice numerico riferito a ciascuna riga del buffer
			)
			buffer.clear()										# Pulizia del buffer

		total_time_applicationRangeQueries = float(time.perf_counter() - start_time_applicationRangeQueries)
		print(f"<System>      Time taken: {total_time_applicationRangeQueries:.6f} s")

	print()
	print("<System> Program finished.\n")

if __name__ == "__main__":
	main()