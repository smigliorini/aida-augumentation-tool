import geopandas as gpd
import logging
import math
import os
import pandas as pd
import time
from multiprocessing import Pool, cpu_count
from shapely import wkt
from shapely.geometry import box, Point

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'analyze_csv':
def analyze_csv(file_path):

	"""
	Funzione che passato in ingresso un file '.csv', restituisce liste corrispondenti alle colonne del file
	in ingresso (le colonne sono 'pathDatasets', 'nameDatasets', 'pathIndexes', 'typePartitions', 'num'):
	--> PARAMETRI IN INGRESSO: percorso del file (filePath);
	--> PARAMETRI IN USCITA: DataFrame con ciascuna riga un dataset composta da (["pathDatasets", "nameDataset", "pathIndexes", "typePartition", "num"]).
	"""

	df = pd.read_csv(file_path, sep=';')
	expected = ["pathDatasets", "nameDataset", "pathIndexes", "typePartition", "num"]
	if df.columns.tolist() != expected:
		raise ValueError(f"[Main] <System> ERROR: the CSV header expected is '{expected}'...")
	return df

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'index_dataset_wrapper':
def index_dataset_wrapper(args):
	print("<System> WORKER STARTED:", args)
	try:
		pathDatasets, nameDataset, pathIndexes, typePartition, num = args				# Valori passati legati alla task da eseguire
    
		logging.info("")
		logging.info(f"<System> Partitioning '{nameDataset}'!")
		
		start = time.perf_counter()
		
		index_dataset(
			pathDatasets,
			nameDataset,
			pathIndexes,
			typePartition,
			int(num)
		)
		
		end = time.perf_counter()
		logging.info(f"<System> Time for partitioning '{nameDataset}': {end - start:.6f}")

		return f"OK - {nameDataset}"

	except Exception as e:
		print(f"<System> ERROR processing {args[1]} -> {e}")
		return f"ERROR - {args[1]} -> {e}"

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'index_dataset':
def index_dataset(pathDatasets, nameDataset, pathIndex, typePartition, num):

	"""
	Funzione che, passato in ingresso le informazioni sul dataset in questione,	effettua la partizione
	del dataset e ne salva il corrispondente indice spaziale.
	--> PARAMETRI IN INGRESSO: percorso dataset (pathDataset);
 							   nome dataset (nameDataset);
							   cartella in cui inserire l'indice spaziale (pathIndex);
 							   tipologia partizione (typePartition);
							   numero associato al tipo di partizione (num).
	"""

	# 1. Costruzione percorsi utili ---------------------------------------------------------------------------------------------
	pathDataset = os.path.join(pathDatasets, nameDataset)								# Costruzione del percorso contenente il dataset [datasets/datasetsData_Time_UniqueCode | datasetNumber.ext => datasets/datasetsData_Time_UniqueCode/datasetNumber.ext]
	if not os.path.exists(pathDataset):													# Verifica dell'esistenza del dataset nella cartella
		logging.info(f"<System> Dataset '{pathDataset}' does not exist!")
		return
	
	folderIndexes = os.path.join(pathIndex, os.path.basename(pathDatasets))				# Costruzione del percorso che conterrà l'indici spaziali dei dataset in questione [indexes | datasets/datasetsData_Time_UniqueCode => indexes/datasetsData_Time_UniqueCode]
	nameD, extD = os.path.splitext(nameDataset)											# Nome del dataset e estensione di quest'ultimo [datasetNumber.ext => datasetNumber | .ext]
	outputIndex = os.path.join(folderIndexes, f"{nameD}_spatialIndex")					# Costruzione del percorso che conterrà l'indice spaziale dell'iesimo dataset [indexes/datasetsData_Time_UniqueCode | datasetNumber => indexes/datasetsData_Time_UniqueCode/datasetNumber]
	os.makedirs(outputIndex, exist_ok=True)												# Generazione del percorso contenente l'indice spaziale

	# 2. Caricamento del dataset in questione in una struttura dati (GeoDataFrame) ----------------------------------------------
	logging.info(f"<System> Generation DataFrame for dataset '{nameDataset}'.")
	start_time_generationDataFrame = time.perf_counter()
	try:
		gdf, numGeom, typeGeom = load_dataset(pathDataset, extD)
	except ValueError as e:
		logging.info(f"<System> Generation DataFrame skipped for this dataset. Error: {e}")
		return
	total_time_generationDataFrame = float(time.perf_counter() - start_time_generationDataFrame)
	logging.info(f"<System>      Time taken: {total_time_generationDataFrame:.6f} s")

	# 3. Definizione del numero di partizioni da generare e del numero di geometrie da avere per ciascuna partizione ----------
	logging.info(f"<System> Calculate the number of geometries for each partition and the number of partitions to perform for the dataset '{nameDataset}'.")
	start_time_calculatePartition = time.perf_counter()
	try:
		n_partitions, n_geometries = calculation_parameters_partitioning(pathDataset, typePartition, num, numGeom)
		minx, miny, maxx, maxy = gdf.total_bounds							# Calcolo della dimensione della finestra di dataset
		dataset_area = (maxx - minx) * (maxy - miny)						# Calcolo dell'area contenente il dataset in questione
		min_area = dataset_area / (n_partitions * 4)						# Calcolo dell'area minima per ciascuna partizione
	except ValueError as e:
		logging.info(f"<System> Partitioning skipped for this dataset. Error: {e}")
		return
	total_time_calculatePartition = float(time.perf_counter() - start_time_calculatePartition)
	logging.info(f"<System>      Number of geometries requested by the user for each partition: '{n_geometries}'")
	logging.info(f"<System>      Number of partitions requested by the user: '{n_partitions}'")
	logging.info(f"<System>      Minimum area calculated for each partition: '{min_area}'")
	logging.info(f"<System>      Time taken: {total_time_calculatePartition:.6f} s")

	# 4. Costruzione delle partizioni richieste per la realizzazione dell'indice spaziale -------------------------------------
	logging.info(f"<System> Construction of partitions using quadtree algorithm on the dataset '{nameDataset}'.")
	start_time_computeQuadtree = time.perf_counter()
	time_saving, master_rows = compute_quadtree(gdf, n_geometries, min_area, outputIndex, typeGeom)
	total_time_computeQuadtree = float((time.perf_counter() - start_time_computeQuadtree) - time_saving)
	logging.info(f"<System>      Time taken: {total_time_computeQuadtree:.6f} s")
	logging.info(f"<System> Saving partitions to folder '{outputIndex}'.")
	logging.info(f"<System>      Time taken: {time_saving:.6f} s")

	# 5. Salvataggio della "MasterTable" ricapitolativa contenente l'indice spaziale ------------------------------------------
	logging.info(f"<System> Creating and saving the summary 'MasterTable' containing the spatial index related to the dataset '{nameDataset}'.")
	start_time_masterTable = time.perf_counter()
	df_master = pd.DataFrame(master_rows)
	out_path_table = os.path.join(outputIndex, f"master_table.csv")
	df_master.to_csv(out_path_table, index=False)
	total_time_masterTable = float(time.perf_counter() - start_time_masterTable)
	logging.info(f"<System>      Time taken: {total_time_masterTable:.6f} s")

	# 6. Identifico se ci sono state geometrie duplicate (e quante ce ne sono in più) o meno ----------------------------------
	total_partition_geom = int(df_master["NumberGeometries"].sum())				# Numero totale di geometrie nelle partizioni generate
	difference = total_partition_geom - len(gdf)								# Numero di geometrie in più rispetto al dataset iniziale
	if difference < 0:															# C'è stata perdita di geometrie (difference < 0)
		logging.info(f"<System> There were {-difference} lost geometries!")
	elif difference == 0:														# Non ci sono state duplicazioni o perdite di geometrie (difference = 0)
		logging.info("<System> There were no duplications of geometries!")
	else:																		# Ci sono state duplicazioni di geometrie (difference > 0)
		logging.info(f"<System> There were {difference} duplicate geometries!")

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'load_dataset':
def load_dataset(pathDataset, extD):

	"""
	Funzione che permette il caricamento delle geometrie in un DataFrame spaziale.
	--> PARAMETRI IN INGRESSO: percorso contenente il dataset in questione (pathDataset);
							   estensione del file contenente il dataset in questione (extD).
	--> PARAMETRI IN USCITA: DataFrame costruito contenente le geometrie del dataset in questione (gdf);
							 Numero di geometrie che appartengono al dataset in questione;
							 1 = Point, 2 = Box, 3 = Polygon.
	"""

	if extD.lower() == ".wkt":																				# Se il file è un ".wkt" (geometry == POLYGON) --> POLYGON
		with open(pathDataset, "r", encoding="utf-8") as f:													# Lettura del file ".wkt"
			wkt_list = [line.strip() for line in f if line.strip()]
		df = pd.DataFrame({"wkt": wkt_list})
		df["polygon"] = df["wkt"].apply(wkt.loads)															# Le stringhe "POLYGON(...)" sono state convertite in oggetti geometrici di tipo shapely.geometry.Polygon
		gdf = gpd.GeoDataFrame(df, geometry="polygon")														# Generazione di un GeoDataFrame, struttura dati geospaziale di GeoPandas per la gestione di dati geospaziali
		return gdf, len(gdf), 3
	else:																									# Se il file è un ".csv" (geometry == POINT || geometry == BOX)
		df = pd.read_csv(pathDataset, header=None)															# Pandas legge il file come tabella con una sola colonna, ogni riga è una geometria
		if len(df.columns) == 2:																			# --> POINT
			df.columns = ["x", "y"]																			# Viene dato un nome alle due colonna del dataframe - POINT
			df["x"] = pd.to_numeric(df["x"], errors="coerce")												# Convertire colonna X in float
			df["y"] = pd.to_numeric(df["y"], errors="coerce")												# Convertire colonna Y in float
			df = df.dropna(subset=["x", "y"])																# Eliminare valori non validi
			geom = df.apply(lambda r: Point(r["x"], r["y"]), axis=1)										# Generazione della geometria: punto di coordinate x, y
			gdf = gpd.GeoDataFrame(df, geometry=geom)														# Generazione del DataFrame: uso della geometria precedentemente creata
			return gdf, len(gdf), 1
		elif len(df.columns) == 4:																			# --> BOX
			df.columns = ["xmin", "ymin", "xmax", "ymax"]													# Viene dato un nome alle quattro colonna del dataframe - BOX
			for col in ["xmin", "ymin", "xmax", "ymax"]:													# Per ogni valore...
				df[col] = pd.to_numeric(df[col], errors="coerce")											# ... converto in float
			df = df.dropna(subset=["xmin", "ymin", "xmax", "ymax"])											# Eliminazre valori non validi
			geom = df.apply(lambda r: box(r["xmin"], r["ymin"], r["xmax"], r["ymax"]), axis=1)				# Generazione della geometria: punto di coordinate xmin, ymin, xmax, ymax
			gdf = gpd.GeoDataFrame(df, geometry=geom)														# Generazione del DataFrame: uso della geometria precedentemente creata
			return gdf, len(gdf), 2
		else:
			raise ValueError("<System>      Unsupported CSV format!")

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'calculation_parameters_partitioning':
def calculation_parameters_partitioning(pathDataset, typePartition, num, numGeom):

	"""
	Funzione che calcola il numero di geometrie per partizione e il numero di partizioni da generare in base
	al tipo di partizione richiesto dall'utente.
	--> PARAMETRI IN INGRESSO: percorso contenente il dataset in questione (pathDataset);
							   tipo di partizionamento richiesto dall'utente (typePartition);
							   numero correlato al tipo di partizionamento inserito dall'utente (num);
							   numero di geometrie appartenenti al dataset in questione (numGeom).
	--> PARAMETRI IN USCITA: numero di partizioni da generare (n_partitions);
							 numero di geometrie per partizione (n_geometries).
	"""

	if num <= 0:																	# L'utente ha inserito un valore minore o uguale a 0
		raise ValueError(f"<System>      The number '{num}' entered by the user cannot be accepted because it <= 0")
	elif typePartition == "partitions":												# L'utente ha inserito il numero di partizioni -> num = numPartitions
		n_partitions = num															# numPartitions
		n_geometries = max(1, math.ceil(numGeom / num))								# numGeomPartition = numGeomDataset / numPartitions
		return n_partitions, n_geometries
	elif typePartition == "geometries":												# L'utente ha inserito il numero di geometrie per partizione -> num = numGeomPartition
		n_geometries = num															# numGeomPartition
		n_partitions = max(1, math.ceil(numGeom / n_geometries))					# numPartitions = numGeomDataset / numGeomPartition
		return n_partitions, n_geometries
	elif typePartition == "bytes":													# L'utente ha inserito il numero di bytes per partizione -> num = bytesOnePartition
		file_size = os.path.getsize(pathDataset)									# Identifico il peso (in bytes) del dataset in questione (bytesDataset)
		geom_size = math.ceil(file_size / numGeom)									# bytesOneGeom = bytesDataset / numGeomDataset
		n_geometries = max(1, math.ceil(num / geom_size))							# numGeomPartition = bytesOnePartition / bytesOneGeom
		n_partitions = max(1, math.ceil(numGeom / n_geometries))					# numPartitions = numGeomDataset / numGeomPartition
		return n_partitions, n_geometries
	else:																			# L'utente ha inserito un tipo di partizionamento non conforme a quelli possibili
		raise ValueError(f"<System>      The partition type '{typePartition}' is incorrect!")
	
# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'compute_quadtree':
def compute_quadtree(gdf, n_geom_partition, min_area_partition, outputIndex, typeGeom):

	"""
	Funzione che costruisce le partizioni tramite tecnica "QuadTree" in modo da avere partizioni con un numero di geometrie
	massimo pari a quello richiesto dall'utente (sfrutta tecnica di parallelizzazione per ogni livello dell'albero).
	--> PARAMETRI IN INGRESSO: GeoDataFrame contenente le geometrie del dataset in questione (gdf);
 							   numero di geometrie per partizione richiesto dall'utente (n_geom_partition);
							   area minima per ciascuna partizione generata (min_area_partition);
							   percorso in cui salvare le partizioni (outputIndex);
							   tipo di geometria da salvare (typeGeom).
	--> PARAMETRI IN USCITA: tempo impiegato per il salvataggio delle partizioni relative al dataset in questione (time_saving);
							 righe da salvare nella Master Table del dataset in questione (master_table).
	"""

	max_geom = int(math.ceil(n_geom_partition))															# Limite massimo di geometrie per partizione: numGeomPartition
	partitions = []																						# Lista contenente i DataFrame che corrispondono alle partizioni del dataset in questione da salvare
	partition_id = 0																					# Contatore di partizioni
	partitions_size = 8																					# Numero che identifica quante partizioni bisogna trovare prima di iniziare a salvarle
	master_rows = []																					# Lista contenente le righe da salvare nella master table
	time_saving = 0.0																					# Tempo impiegato per salvare le partizioni

	current_level = [{																					# Livello corrente dell'albero da analizzzare composto da nodi con:
		"gdf": gdf,																						# GeoDataFrame da partizionare (all'inizio intero dataset di partenza)
		"bbox": gdf.total_bounds																		# BoundingBox del GeoDataFrame passato (all'inizio intero BoundingBox del dataset di partenza)
	}]

	while current_level:																				# Finchè ci sono elementi da partizionare (ogni iterazione rappresenta un livello del QuadTree)...
		logging.info(f"<System>      Length current level: '{len(current_level)}'")
		next_level = []																					# Lista dei nodi figli generati dal processamento del nodo in analisi

		for node in current_level:																		# Per ogni nodo ancora da processare...
			minX_node, minY_node, maxX_node, maxY_node = node["bbox"]									# Valori minimi e massimi della box relativa alla partizione corrente
			node_area = (maxX_node - minX_node) * (maxY_node - minY_node)								# Area corrispondente alla partizione corrente
			if len(node["gdf"]) <= max_geom:															# TROVATO PARTIZIONE: il numero di geometrie nella partizione è inferiore a quello richiesto dall'utente
				logging.info(f"<System>           New partition added to the save queue [minimum number of geometries reached].")
				partitions.append(node)																	# ... inserisco il nodo nella lista di nodi da salvare come partizioni finali
			elif node_area <= min_area_partition:														# TROVATO PARTIZIONE: l'area della partizione in analisi è troppo piccola per essere partizionata
				logging.info(f"<System>           New partition added to the save queue [minimum area reached].")
				partitions.append(node)																	# ... inserisco il nodo nella lista di nodi da salvare come partizioni finali
			else:																						# Se le geometrie nel nodo superano "max_geom" o l'area del nodo è abbastanza grande...
				children = partitioning_node(node)														# ... il nodo va diviso in quattro quadranti e...
				if not children:																		# TROVATO PARTIZIONE: il partizionamento non ha generato figli
					logging.info(f"<System>           New partition added to the save queue [children not generated correctly].")
					partitions.append(node)																# ... inserisco il nodo nella lista di nodi da salvare come partizioni finali
				elif all(len(child["gdf"]) == len(node["gdf"]) for child in children):					# TROVATO PARTIZIONE: il partizionamento ha generato figli identici al padre
					logging.info(f"<System>           New partition added to the save queue [the children are identical to the father].")
					partitions.append(node)
				else:																					# FIGLI DA CONTROLLARE: partizione del nodo padre avvenuta correttamente
					logging.info(f"<System>           New partition added to the queue of nodes to be analyzed.")
					next_level.extend(children)															# ... inserisco i quattro quadranti figli generati come prossimi nodi da analizzare

		current_level = next_level																		# Sostituisco il livello corrente con quello appena generato
			
		if len(partitions) >= partitions_size:															# Se ho abbastanza partizioni pronte per essere salvate, procedo con il loro salvataggio:
			start_partialTime_saving = time.perf_counter()
			rows, partition_id = saving_partitions(partitions, outputIndex, typeGeom, partition_id)		# Salvataggio delle partizioni
			master_rows += rows
			end_partialTime_saving = float(time.perf_counter() - start_partialTime_saving)
			time_saving += end_partialTime_saving
			partitions.clear()																			# Rimozione delle partizioni appena salvate
			
	if partitions:																						# Se ho ancora partizioni da salvare:
		start_partialTime_saving = time.perf_counter()
		rows, partition_id = saving_partitions(partitions, outputIndex, typeGeom, partition_id)			# Salvataggio delle partizioni
		master_rows += rows		
		end_partialTime_saving = float(time.perf_counter() - start_partialTime_saving)
		time_saving += end_partialTime_saving
		partitions.clear()																				# Rimozione delle partizioni appena salvate

	return time_saving, master_rows

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'partitioning_node':
def partitioning_node(node):

	"""
	Funzione che partiziona il nodo passato in quattro sottopartizioni.
	--> PARAMETRI IN INGRESSO: Nodo composto da GeoDataFrame e BoundingBox (node).
	--> PARAMETRI IN USCITA: Lista con le quattro sottopartizioni generate.
	"""

	gdf = node["gdf"]									# Estrazione del GeoDataFrame dal nodo
	min_x, min_y, max_x, max_y = node["bbox"]			# Estrazione della BoundingBox dal nodo
	mid_x = (min_x + max_x) / 2							# Calcolo del punto medio della BoundingBox asse X
	mid_y = (min_y + max_y) / 2							# Calcolo del punto medio della BoundingBox asse Y

	# BoundingBox dei quattro quadranti
	bbox_NE = box(mid_x, mid_y, max_x, max_y)			# BBox_AltoDestra: x_medio, y_medio, x_fine, y_fine
	bbox_NW = box(min_x, mid_y, mid_x, max_y)			# BBox_AltoSinistra: x_inizio, y_medio, x_medio, y_fine
	bbox_SW = box(min_x, min_y, mid_x, mid_y)			# BBox_BassoSinistra: x_inizio, y_inizio, x_medio, y_medio
	bbox_SE = box(mid_x, min_y, max_x, mid_y)			# BBox_BassoDestra: x_medio, y_inizio, x_fine, y_medio
	bbox_list = [bbox_NE, bbox_NW, bbox_SW, bbox_SE]	# Lista contenente i quattro quadranti con "bbox, nominativo"

	# Inserimento delle geometrie appartenenti ai vari quadranti
	children = []										# Lista contenente le partizioni da far analizzare
	for bbox_poly in bbox_list:							# Scorro la lista contenente i quattro quadranti in analisi
		mask = gdf.geometry.intersects(bbox_poly)		# Maschera composta da boolean per ogni geometria (true = appartiene, false = non appartiene)
		sub_gdf = gdf[mask]								# Mantengo le sole geometrie che intersecano il quadrante sfruttando la maschera costruita

		if not sub_gdf.empty:							# Se la lista di geometrie non è vuota...
			children.append({							# ... la salvo nelle partizioni da analizzare
				"gdf": sub_gdf,
				"bbox": bbox_poly.bounds
			})

	return children

# -------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE 'saving_partitions':
def saving_partitions(partitions, outputIndex, typeGeom, start_id):

	"""
	Funzione che salva le partizioni generate.
	--> PARAMETRI IN INGRESSO: lista contenente le partizioni (nodi con GeoDataFrame all'interno) da salvare (partitions);
							   percorso in cui salvare le partizioni (outputIndex);
							   tipo di geometria da salvare (typeGeom);
							   ID corrente delle partizioni utile per il salvataggio delle nuove (start_id).
	--> PARAMETRI IN USCITA: lista contenente le righe da salvare nella Master Table (master_rows);
							 ID nuovo per i prossimi salvataggi di partizioni (current_id).
	"""

	master_rows = []
	current_id = start_id
	for part in partitions:
		gdf_subset = part["gdf"]											# Estraggo dal DataFrame originale solo le geometrie appartenenti alla partizione in analisi
		geom_col = gdf_subset.geometry.name
		file_name = f"partition_{current_id}"
		out_path = os.path.join(outputIndex, file_name)						# Costruisco il percorso di salvataggio

		if typeGeom == 3:													# POLYGON, salvo in WKT
			GeometryType = "POLYGON"
			file_name += ".wkt"
			out_path += ".wkt"
			gdf_subset[geom_col].apply(lambda g: g.wkt).to_csv(out_path, index=False, header=False)

		else:
			file_name += ".csv"
			out_path += ".csv"

			if typeGeom == 1:												# POINT, salvo in CSV
				GeometryType = "POINT"
				df_out = pd.DataFrame({
					"x": gdf_subset.geometry.x,
					"y": gdf_subset.geometry.y
				})
			else:															# BOX, salvo in CSV
				GeometryType = "BOX"
				df_out = pd.DataFrame([
					list(g.bounds) for g in gdf_subset.geometry
				], columns=["xmin", "ymin", "xmax", "ymax"])

			df_out.to_csv(out_path, index=False, header=False)
		
		# Costruzione della Master Table
		min_x, min_y, max_x, max_y = part["bbox"]
		master_rows.append({
			"ID": current_id,
			"NamePartition": file_name,
			"NumberGeometries": len(part["gdf"]),
			"FileSize": os.path.getsize(out_path),
			"GeometryType": GeometryType,
			"xMin": min_x,
			"yMin": min_y,
			"xMax": max_x,
			"yMax": max_y
		})
		current_id += 1
	
	return master_rows, current_id

# Logging usato per stampa corretta in fase di multiprocessing
def init_worker():
	logging.basicConfig(
		level=logging.INFO,
		format="[%(processName)s] %(message)s"
	)


def main():
	file_input = "indexParameters.csv"															# File '.csv' contenente gli input
	print(f"[Main] <System> Starting the reading process for file '{file_input}'!")
	start_time_analysisInputFile = time.perf_counter()
	if not os.path.exists(file_input):															# Verifica dell'esistenza del file 'indexParameters.csv'
		raise ValueError(f"[Main] <System> ERROR: The file '{file_input}' does not exist!")
	df = analyze_csv(file_input)																# Richiamo una funzione che analizzi gli input del file e restituisca un DataFrame
	"""
	try:																						# Eliminazione del file 'indexParameters.csv' con verifica
		os.remove(file_input)
		print(f"[Main] <System> The file '{file_input}' has been successfully deleted!")
	except Exception as e:
		print(f"[Main] <System> Unable to delete file '{file_input}'! Error: {e}")
	"""
	total_time_analysisInputFile = float(time.perf_counter() - start_time_analysisInputFile)
	print(f"[Main] <System>      Time taken: {total_time_analysisInputFile:.6f} s")

	print("[Main] <System> Starting the dataset partitioning process!")
	tasks = [														# Preparazione di una lista di task da eseguire (una per ogni dataset da partizionare)
		(
			row.pathDatasets,										# Path completo in cui è contenuto l'i-esimo dataset
			row.nameDataset,										# Nome completo con estensione dell'i-esimo dataset
			row.pathIndexes,										# Cartella dove verranno salvati gli indici spaziali
			row.typePartition,										# Tipo di partizione richiesta dall'utente (partitions || geometries || bytes) relativa all'i-esimo dataset
			row.num													# Numero correlato al tipo di partizione richiesta dall'utente
		)
		for row in df.itertuples(index=False)						# Generazione di un task per ciascun dataset
	]
	print(f"[Main] <System> Number of tasks generated: {len(tasks)}")

	with Pool(max(1, cpu_count() - 1), initializer=init_worker) as pool:						# Invio dei tasks in parallelo (carico di lavoro distribuito)
		pool.map(index_dataset_wrapper, tasks)

	print()
	print("[Main] <System> Program finished.\n")


if __name__ == "__main__":
	main()