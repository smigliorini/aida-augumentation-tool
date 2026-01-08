import pandas as pd
import os
import csv
import random
import subprocess
import warnings
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from multiprocessing import Pool, cpu_count
from rtree import index
import numpy as np
import math
import time

# Ignore all warnings
warnings.filterwarnings("ignore")

# FUNZIONE "csvReading":
# Funzione che legge il file contenente gli input e li restituisce come parametri.
# Input:  filePath --> file contenente gli input.
# Output: pathTrainingSet --> percorso contenente i principali file correlati al training set scelto dall'utente;
# 		  nameBin --> file contenente i bin generati;
# 		  nameSummary --> file contenente i dati relativi al dataset in analisi;
# 		  nameRangeQueriesResult --> file contenente le range queries (con risultati) relativi al dataset in analisi;
# 		  nameInputs --> file contenente le richieste dell'utente su cui applicare le tecniche di augmentation;
# 		  pathDatasets --> percorso contenente i datasets;
# 		  pathIndexes --> percorso contenente gli indici spaziali.
def csvReading(filePath):
	# Controllo che il file 'filePath' esista
	if not os.path.isfile(filePath):
		raise FileNotFoundError(f"<System> The file {filePath} does not exist or is not a valid file!")

	#Lettura del file 'filePath'
	with open(filePath, mode='r', encoding='utf-8') as file:
		reader = csv.reader(file, delimiter=';')		# Lettura del file con separazione dei parametri rispetto al ";"
		header = next(reader)							# Lettura della prima riga (intestazione del file)
		values = next(reader)							# Lettura della seconda riga (valori input)

	# Intestazione corretta che dovrebbe avere 'filePath'
	expectedHeader = [
		'pathTrainingSet',
		'nameBin',
		'nameSummary',
		'nameRangeQueriesResult',
		'nameInputs',
		'pathDatasets',
		'pathIndexes'
	]

	# Controllo che il file 'filePath' sia corretto e con la giusta intestazione
	if header != expectedHeader:
			raise ValueError(f"<System> The file '{filePath}' is incorrect. Invalid header!")

	# Eliminazione del file 'filePath'
	#os.remove(filePath)
	#print(F"<System> The file '{filePath}' has been successfully deleted!")

	# Restituzione dei parametri di input
	return (
		values[0],			# pathTrainingSet = percorso contenente i principali file correlati al training set scelto dall'utente
		values[1],			# nameBin = file contenente i bin generati
		values[2],			# nameSummary = file contenente i dati relativi al dataset in analisi
		values[3],			# nameRangeQueriesResult = file contenente le range queries (con risultati) relativi al dataset in analisi
		values[4],			# nameInputs = file contenente le richieste dell'utente su cui applicare le tecniche di augmentation
		values[5],			# pathDatasets = percorso contenente i datasets
		values[6]			# pathIndexes = percorso contenente gli indici spaziali
	)

# FUNZIONE "create_intervals":
# Funzione che legge gli intervalli bin dal file e salva il numero di queries per caiscun intervallo
# Input:  bin_result --> file contenente i bin generati
# Output: labels --> ['0-1', '1-2', '2-3', '3-4', '4-5', '5-6']
# 		  num_queries --> [3, 5, 2, 8, 11, 7]
def create_intervals(bin_result):
	labels = bin_result.iloc[:, 1].tolist()						# Inserisco la seconda colonna (intervalli)
	num_queries = bin_result.iloc[:, 2].astype(int).tolist()	# Inserisco la terza colonna convertita in interi (numero di queries)
	return labels, num_queries

# FUNZIONE "format_number":
# Funzione usata per formattare un numero in stringa, con 10 cifre decimali in rappresentazione float fixed-point
# Input:  num --> numero da convertire
# Output: string --> numero convertito in stringa seguendo il formato indicato
def format_number(num):
	return f"{num:.10f}"

# FUNZIONE "validate_input":
# Funzione che controlla se l'iesima riga di input è nel valida e scritta nel seguente formato:
# bin_num num_queries distribution augmentation_technique1 [augmentation_technique2] [augmentation_technique3]
# Input:  user_input --> bin2 12 uniform noise rotation
# Output: bin_num --> 'bin2'
#		  num_queries --> 12
# 		  distribution --> 'uniform'
# 		  augmentation_techniques --> ['noise', 'rotation']
def validate_input(user_input):
	# Divido l'input in parti --> ['bin2', '12', 'uniform', 'noise', 'rotation']
	parts = user_input.split()

	# L'input inserito deve avere almeno 4 campi minimi
	if len(parts) < 4:
		raise ValueError("Input must be in the format \"bin_num num_queries distribution augmentation_technique1 [augmentation_technique2] [augmentation_technique3]\"...")

	# Analisi di "bin_num" (controllo che il campo inizi con bin e che dal terzo carattere ci sia un numero):
	bin_num = parts[0]
	if not bin_num.startswith("bin") or not bin_num[3:].isdigit():
		raise ValueError("The bin number must start with 'bin' followed by a number (e.g., 'bin0')...")

	# Analisi di "num_queries" (controllo che il campo sia un numero):
	num_queries = parts[1]
	if not num_queries.isdigit():
		raise ValueError("The number of queries must be an integer...")

	# Analisi di "distribution" (controllo che il campo sia una distribuzione valida tra quelle possibili):
	distribution = parts[2]
	if distribution not in ['uniform', 'diagonal', 'gaussian', 'sierpinski', 'bit', 'parcel']:
		raise ValueError("Invalid distribution. Allowed values are 'uniform', 'diagonal', 'gaussian', 'sierpinski', 'bit' or 'parcel'...")

	# Analisi di "augmentation_technique" (controllo che i campi successivi siano delle tecniche di augmentation valide tra quelle possibili):
	augmentation_techniques = parts[3:]
	for technique in augmentation_techniques:
		if technique not in ['rotation', 'noise', 'merge']:
			raise ValueError("Invalid augmentation technique. Allowed values are 'rotation', 'noise' or 'merge'...")

	# Ritorno i campi convalidati relativi all'iesimo input inserito dall'utente
	return bin_num, int(num_queries), distribution, augmentation_techniques

# FUNZIONE "update_bin":
# Funzione che aggiorna il file "path_nameBin" con il numero di bin corretto.
# Input: bin_label --> bin da aggiornare;
# 		 num_queries --> numero di queries da aggiornare per quel bin;
# 		 path_nameBin --> percorso contenente il file da aggiornare.
def update_bin(bin_label, num_queries, path_nameBin):
	df_bin = pd.read_csv(path_nameBin, delimiter=';')							# Lettura dei bin con i relativi parametri
	df_bin.loc[df_bin['BinRange'] == bin_label, ['Count']] = [num_queries]		# Aggiornamento del campo "Count" con "num_queries" del bin interessato
	df_bin.to_csv(path_nameBin, index=False, sep=';')							# Aggiornamento nel file di "path_nameBin"

# FUNZIONE "get_coordinates":
# Funzione usata per ricercare e restituire le massime coordinate di "dataset_name"
# Input: dataset_summary_file --> percorso del file ".csv" contenente il riepilogo dei datasets;
# 		 dataset_name --> nome del dataset di cui si vogliono ottenere le coordinate.
# Output: x1, y1, x2, y2 --> massime coordinate del dataset in questione.
def get_coordinates(dataset_summary_file, dataset_name):
	df_summary = pd.read_csv(dataset_summary_file, delimiter=';')				# lettura di "dataset_summary_file"
	summary_row = df_summary[df_summary['datasetName'] == dataset_name]			# filtraggio rispetto alla riga contenente "dataset_name"
	if len(summary_row) == 0:													# verifica che in "dataset_summary_file" ci sia o meno "dataset_name"
		raise ValueError(f"<System> No dataset information found for {dataset_name} in folder {dataset_summary_file}.")
	x1, y1, x2, y2 = summary_row.iloc[0]['x1'], summary_row.iloc[0]['y1'], summary_row.iloc[0]['x2'], summary_row.iloc[0]['y2']		# estrazione delle coordinate cercate
	return x1, y1, x2, y2

# FUNZIONE "reload"
# Funzione che permette di caricare i file "nameBin", "nameSummary" e "nameRangeQueriesResult"
# Input: percorsi dei file
# Output: contenuto dei file richiesti
def reload(path_nameBin, path_nameSummary, path_nameRangeQueriesResult):
	bin_result = pd.read_csv(path_nameBin, delimiter=';')						# lettura del file "nameBin"
	summary_data = pd.read_csv(path_nameSummary, delimiter=';')					# lettura del file "nameSummary"
	main_data = pd.read_csv(path_nameRangeQueriesResult, delimiter=';')			# lettura del file "nameRangeQueriesResult"

	# Verifica sulla presenza o meno della colonna "distribution" (se non c'è, la inserisce)
	if 'distribution' not in main_data.columns:
		if 'distribution' not in summary_data.columns:
			raise KeyError(f"<System> ERROR! The 'distribution' column is missing in file '{path_nameSummary}'...")
		main_data = main_data.merge(summary_data[['datasetName', 'distribution']], on='datasetName', how='left')

	return bin_result, summary_data, main_data

# -----------------------------------------------------------------------------------------------------------------------------------------------------------
# Funzioni usate per applicare la tecnica di ROTAZIONE del dataset!

# FUNZIONE "generate_random_degree":
# Funzione che restituisce un angolo 'realistico' per la rotazione:
# Output: degree --> angolo di rotazione (es. 91.7)
def generate_random_degree():
	intervals = [88, 89, 90, 91, 92, 178, 179, 180, 181, 182, 268, 269, 270, 271, 272]	# lista di valori interi che circondano gli angolo principali (90, 180, 270)
	base_value = random.choice(intervals)												# selezione di un valore base tra "intervals" prima dichiarati
	decimal_part = random.uniform(0, 0.9)												# genero una parte frazionaria da aggiungere all'angolo scelto (tra 0.0 e 0.9)
	degree = round(base_value + decimal_part, 1)										# sommo le due parti e arrotondo ad una cifra decimale
	return degree																		# restituisco l'angolo di rotazione






















# FUNZIONE "rotate_points":
# Funzione che procede effettivamente alla rotazione dei punti passati
# Input: cx --> coordinata x del centro di rotazione
# 		 cy --> coordinata y del centro di rotazione
# 		 angle --> angolo in radianti
# 		 px --> array delle coordinate x dei punti da ruotare
# 		 py --> array delle coordinate y dei punti da ruotare
# Output: px --> array delle coordinate x con i punti ruotati
# 		  py --> array delle coordinate y con i punti ruotati
def rotate_points(cx, cy, angle, px, py):

	s = np.sin(angle)			# seno di "angle"
	c = np.cos(angle)			# coseno di "angle"
	px -= cx					# Traslo le x di tutti i punti in modo che il centro di rotazione diventi l'origine
	py -= cy					# Traslo le y di tutti i punti in modo che il centro di rotazione diventi l'origine

	# formula rotazione 2D: x' = x * cos(θ) - y * sin(θ), y' = x * sin(θ) - y * cos(θ)
	xnew = px * c - py * s		# rotazione di tutte le coordinate x dei punti, contemporaneamente
	ynew = px * s + py * c		# rotazione di tutte le coordinate y dei punti, contemporaneamente

	px = xnew + cx				# riporta le x dei punti nel sistema originale, traslandoli indietro
	py = ynew + cy				# riporta le y dei punti nel sistema originale, traslandoli indietro

	return px, py

# FUNZIONE "rotate_boxes":
# Funzione che ruota il box inorno al centro "(cx, cy)" di un angolo "angle"
# Input: df --> dataset letto dal ".csv"
# 		 cx --> coordinata x del centro
# 		 cy --> coordinata y del centro
# 		 angle --> angolo di rotazione in radianti
def rotate_boxes(df, cx, cy, angle):
	# Estrazione delle coordinate delle box come array
	xmin = df['xmin'].values	# array con tutti gli xmin delle box del dataset
	ymin = df['ymin'].values	# array con tutti gli ymin delle box del dataset
	xmax = df['xmax'].values	# array con tutti gli xmax delle box del dataset
	ymax = df['ymax'].values	# array con tutti gli ymax delle box del dataset

	# Costruzione dei punti che corrispondono ai quattro angoli delle box
	points = np.array([
		[xmin, ymin],			# point[0] --> array con tutti gli xmin e ymin delle box del dataset
		[xmax, ymin],			# punto[1] --> array con tutti gli xmax e ymin delle box del dataset
		[xmax, ymax],			# punto[2] --> array con tutti gli xmax e ymax delle box del dataset
		[xmin, ymax]			# punto[3] --> array con tutti gli xmin e ymax delle box del dataset
	])

	# Rotazione di tutti i punti (points[i][0] = array delle x del vertice i, points[i][1] = array delle y del vertice i)
	rotated_points = [rotate_points(cx, cy, angle, points[i][0], points[i][1]) for i in range(4)]
	# "rotated_points" è una lista così composta:
	# rotated_point[0] = (rotated_x0, rotated_y0)
	# rotated_point[1] = (rotated_x1, rotated_y1)
	# rotated_point[2] = (rotated_x2, rotated_y2)
	# rotated_point[3] = (rotated_x3, rotated_y3)
	# con rotated_xN e rotated_yN array con le coordinate ruotate di quel vertice per tutti i box

	# Stack and calculate new bounding boxes
	all_x_coords = np.vstack([rotated_points[i][0] for i in range(4)])		# prende le x dei nuovi vertici ruotati
	all_y_coords = np.vstack([rotated_points[i][1] for i in range(4)])		# prende le y dei nuovi vertici ruotati

	new_xmin = np.min(all_x_coords, axis=0)			# estrazione di xmin nuova per tutti i box
	new_ymin = np.min(all_y_coords, axis=0)			# estrazione di ymin nuova per tutti i box
	new_xmax = np.max(all_x_coords, axis=0)			# estrazione di xmax nuova per tutti i box
	new_ymax = np.max(all_y_coords, axis=0)			# estrazione di ymax nuova per tutti i box

	return new_xmin, new_ymin, new_xmax, new_ymax

# FUNZIONE "rotate_partition":
# Funzione che legge, ruota e filtra la partizione.
# Input: input_csv --> percorso dove si trova l'i-esima partizione da ruotare;
# 		 angle_degrees --> angolo in gradi con cui ruotare l'i-esima partizione;
# 		 space_bounds --> limiti dello spazio (default da 0 a 10).
# Output: filtered_df --> geometrie ruotate appartenenti all'i-esima partizione;
# 		  removed_count --> eventuali geometrie (boxes) rimosse.
def rotate_partition(input_csv, angle_degrees, space_bounds=(0, 0, 10, 10)):

	angle_radians = math.radians(angle_degrees)														# conversione dell'angolo in radianti
	cx, cy = (space_bounds[2] - space_bounds[0]) / 2, (space_bounds[3] - space_bounds[1]) / 2		# calcolo del centro dello spazio
	df = pd.read_csv(input_csv, header=None, names=['xmin', 'ymin', 'xmax', 'ymax'])				# lettura del file ".csv" senza intestazione
	new_xmin, new_ymin, new_xmax, new_ymax = rotate_boxes(df, cx, cy, angle_radians)				# ruota tutte le box rispetto al centro indicato con l'angolo indicato

	# Organizza le nuove box in un DataFrame nuovo "rotated_df"
	rotated_df = pd.DataFrame({
		'xmin': new_xmin,
		'ymin': new_ymin,
		'xmax': new_xmax,
		'ymax': new_ymax
	})

	# Verifico se ci sono box che hanno anche solo un vertice fuori da "space_bounds" e li elimino
	inside_bounds = (
		(rotated_df['xmin'] >= space_bounds[0]) &
		(rotated_df['ymin'] >= space_bounds[1]) &
		(rotated_df['xmax'] <= space_bounds[2]) &
		(rotated_df['ymax'] <= space_bounds[3])
	)
	filtered_df = rotated_df[inside_bounds]												# tengo solo le box valide rispetto alla maschera costruita prima
	removed_count = len(rotated_df) - len(filtered_df)									# conto i box che sono stati rimossi

	return filtered_df, removed_count





# FUNZIONE "rotate_dataset":
# Funzione che serve a ruotare un dataset ruotando le singole partizioni (sfrutta l'indice spaziale)
# Input: dataset_name --> nome del dataset (senza estensione .csv);
# 		 pathIndexes --> percorso contenente le partizioni del dataset scelto;
# 		 output_ds --> percorso completo dove salvare il dataset ruotato;
# 		 angle_degrees --> angolo in gradi con cui ruotare il dataset.
# Output: output_ds --> percorso completo dove salvare il dataset ruotato;
# 		  geometry_removed --> eventuali geometrie che nel processo di rotazione sono state rimosse.
def rotate_dataset(dataset_name, pathIndexes, output_ds, degree):
	partitions_folder = f"{pathIndexes}/{dataset_name}_spatialIndex"				# percorso contenente l'indice spaziale di "dataset_name"
	master_table = os.path.join(partitions_folder,"_master.rsgrove")				# percorso contenente la Master Table correlata all'indice spaziale di "dataset_name"
	if not os.path.exists(master_table):											# controlla se la Master Table si trova nel percorso indicato
		print(f"<System> The 'Master Table' of '{dataset_name}' not found in folder '{pathIndexes}/{dataset_name}'.")
		return False

	df_master = pd.read_csv(master_table, sep='\t')									# lettura di "master_table"
	partitions = df_master['File Name'].tolist()									# lista delle partizioni di "dataset_name"

	output = []
	geometry_removed = 0
	with ProcessPoolExecutor(max_workers=4) as executor:
		futures = {}																					# dizionario per mappare la 'future' al nome della partizione
		for part_file in partitions:																	# per ogni partizione presente in 'partitions'...
			path_partition = os.path.join(partitions_folder, part_file)									# percorso dell'i-esima partizione
			futures[executor.submit(rotate_partition, path_partition, float(degree))] = part_file		# lancio delle rotazioni in parallelo

		for future in as_completed(futures):															# iterazione sulle "future" che sono terminate
			part_file = futures[future]
			try:
				df_rotate, removed = future.result()													# ottenimento del risultato della task chiamata in precedenza
				geometry_removed = geometry_removed + removed											# calcolo delle geometrie totali rimosse
				output.append(df_rotate)																# aggiunta delle geometrie dell'i-esima partizione ruotata
			except Exception as e:
				print(f"<System> Failed rotating {part_file}: {e}")

	final_df = pd.concat(output, ignore_index=False)													# unione di tutte le geometrie ruotate da inserire nel nuovo dataset
	os.makedirs(os.path.dirname(output_ds), exist_ok=True)												# generazione della cartella corrispondente
	final_df.to_csv(output_ds, index=False, header=False, quoting=csv.QUOTE_NONE)						# scrittura del file

	print(f"<System> New dataset rotated file was saved at {output_ds}")
	return output_ds, geometry_removed





















# Funzione "get_coordinates_rq":
# Funzione che ricerca le coordinate della finestra corrispondenti alla riga di "rq_result_file" con indice "index" passato
# Input: rq_result_file --> file contenente le range queries;
# 		 index --> indice della riga usato per selezionare la riga corretta in "rq_result_file".
# Output: x1, y1, x2, y2 --> coordinate della finestra selezionata da ruotare.
def get_coordinates_rq(rq_result_file, index):
	df_summary = pd.read_csv(rq_result_file, delimiter=';')		# lettura del file "rq_result_file"

	# Controllo che l'indice passato rientri nel DataFrame che sintetizza "rq_result_file"
	if index < 0 or index >= len(df_summary):
		raise IndexError("<System> Index is out of range.")

	# Ottenimento delle coordinate
	x1 = df_summary.iloc[index]['minX']
	y1 = df_summary.iloc[index]['minY']
	x2 = df_summary.iloc[index]['maxX']
	y2 = df_summary.iloc[index]['maxY']

	return x1, y1, x2, y2

# FUNZIONE "get_features":
# Funzione usata per ricercare e restituire il numero di geometrie presenti in "dataset_name"
# Input: dataset_summary_file --> percorso del file ".csv" contenente il riepilogo dei datasets;
# 		 dataset_name --> nome del dataset di cui si vogliono ottenere le coordinate.
# Output: n --> numero di geometrie nel dataset in questione.
def get_features(dataset_summary_file, dataset_name):
	df_summary = pd.read_csv(dataset_summary_file, delimiter=';')				# lettura di "dataset_summary_file"
	summary_row = df_summary[df_summary['datasetName'] == dataset_name]			# filtraggio rispetto alla riga contenente "dataset_name"
	if len(summary_row) == 0:													# verifica che in "dataset_summary_file" ci sia o meno "dataset_name"
		raise ValueError(f"<System> No dataset information found for {dataset_name} in folder {dataset_summary_file}.")
	n = summary_row.iloc[0]['num_features']										# estrazione del numero di geometrie
	return n

# FUNZIONE "rotate_window":
# Funzione che ruota la finestra inorno al centro "(cx, cy)" di un angolo "angle_degrees"
# Input: xmin, ymin, xmax, ymax --> coordinate da ruotare;
# 		 angle_degrees --> angolo in gradi di ritazione.
# Output: ne_xmin, new_ymin, new_xmax, new_ymax --> coordinate ruotate.
def rotate_window(xmin, ymin, xmax, ymax, angle_degrees):
	angle_radians = math.radians(angle_degrees)				# conversione dell'angolo in radianti
	cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2			# calcolo del centro della finestra

	# Costruzione dei punti che corrispondono ai quattro angoli della finestra
	points = np.array([
		[xmin, ymin],			# point[0] --> array con gli xmin e ymin della finestra
		[xmax, ymin],			# punto[1] --> array con gli xmax e ymin della finestra
		[xmax, ymax],			# punto[2] --> array con gli xmax e ymax della finestra
		[xmin, ymax]			# punto[3] --> array con gli xmin e ymax della finestra
	])

	# Rotazione dei punti
	rotated_points = [rotate_points(cx, cy, angle_radians, points[i][0], points[i][1]) for i in range(4)]

	# Stack and calculate new bounding boxes
	all_x_coords = np.vstack([rotated_points[i][0] for i in range(4)])		# prende le x dei nuovi vertici ruotati
	all_y_coords = np.vstack([rotated_points[i][1] for i in range(4)])		# prende le y dei nuovi vertici ruotati

	new_xmin = np.min(all_x_coords)			# estrazione di xmin nuova
	new_ymin = np.min(all_y_coords)			# estrazione di ymin nuova
	new_xmax = np.max(all_x_coords)			# estrazione di xmax nuova
	new_ymax = np.max(all_y_coords)			# estrazione di ymax nuova

	return new_xmin, new_ymin, new_xmax, new_ymax

# FUNZIONE "update_dataset_summary":
# Funzione ustata
# Input: original_dataset_name --> nome del dataset di partenza;
# 		 rotated_dataset_name --> nome del nuovo dataset ruotato;
# 		 x1, y1, x2, y2 --> nuove coordinate della finestra del dataset ruotate;
# 		 number --> numero di geometrie effettive nel nuovo dataset generato;
# 		 path_nameSummary --> percorso contenente il sommario dei datasets;
# 		 path_nameNewDatasets --> percorso contenente il sommario dei nuovi datasets.
def update_dataset_summary(original_dataset_name, rotated_dataset_name, x1, y1, x2, y2, number, path_nameSummary, path_nameNewDatasets):
	df_summary = pd.read_csv(path_nameSummary, delimiter=';')			# Lettura dei datasets presenti
	df_newDatasets = pd.read_csv(path_nameNewDatasets, delimiter=';')	# Lettura dei datasets nuovi ma già generati

	if rotated_dataset_name in df_summary['datasetName'].values:		# Se il dataset ruotato è già presente nella lista, lo aggiorno con le nuove informazioni. Altrimenti ...
		df_summary.loc[df_summary['datasetName'] == rotated_dataset_name, ['x1', 'y1', 'x2', 'y2', 'num_features']] = [x1, y1, x2, y2, number]
		df_newDatasets.loc[df_newDatasets['datasetName'] == rotated_dataset_name, ['x1', 'y1', 'x2', 'y2', 'num_features']] = [x1, y1, x2, y2, number]

	else:																# ... creo una nuova riga da aggiungere con i dati del nuovo dataset
		new_row = pd.DataFrame({
			'datasetName': [rotated_dataset_name],
			'distribution': df_summary.loc[df_summary['datasetName'] == original_dataset_name, 'distribution'].values,
			'geometry': df_summary.loc[df_summary['datasetName'] == original_dataset_name, 'geometry'].values,
			'x1': [x1],
			'y1': [y1],
			'x2': [x2],
			'y2': [y2],
			'num_features': number,
			'max_seg': df_summary.loc[df_summary['datasetName'] == original_dataset_name, 'max_seg'].values,
			'num_points': df_summary.loc[df_summary['datasetName'] == original_dataset_name, 'num_points'].values,
			'avg_area': df_summary.loc[df_summary['datasetName'] == original_dataset_name, 'avg_area'].values,
			'avg_side_length_0': df_summary.loc[df_summary['datasetName'] == original_dataset_name, 'avg_side_length_0'].values,
			'avg_side_length_1': df_summary.loc[df_summary['datasetName'] == original_dataset_name, 'avg_side_length_1'].values,
			'E0': df_summary.loc[df_summary['datasetName'] == original_dataset_name, 'E0'].values,
			'E2': df_summary.loc[df_summary['datasetName'] == original_dataset_name, 'E2'].values
		})
		df_summary = pd.concat([df_summary, new_row], ignore_index=True)			# unisco la riga alle altre righe presenti in "path_nameSummary"
		df_newDatasets = pd.concat([df_newDatasets, new_row], ignore_index=True)	# unisco la riga alle altre righe presenti in "path_nameNewDatasets"

	df_summary.to_csv(path_nameSummary, index=False, sep=';')						# aggiornamento nel file di "path_nameSummary"
	df_newDatasets.to_csv(path_nameNewDatasets, index=False, sep=';')				# aggiornamento nel file di "path_nameNewDatasets"

# FUNZIONE "update_range_query_file":
# Funzione usata per aggiornare "path_nameRangeQueriesResult" - (si cardinality)
# Input: index --> indice della riga usato per selezionare la riga corretta in "rq_result_file";
# 		 rotated_dataset_name --> nome del dataset ruotato;
# 		 minX, minY, maxX, maxY --> coordinate della finestra ruotate;
# 		 path_nameRangeQueriesResult --> percorso del file da aggiornare.
def update_range_query_file(index, rotated_dataset_name, minX, minY, maxX, maxY, path_nameRangeQueriesResult):
	df_range_query = pd.read_csv(path_nameRangeQueriesResult, delimiter=';')	# lettura del file "path_nameRangeQueriesResult"
	original_row = df_range_query.iloc[index]									# selezione della riga con indice "index"

	# generazione di una nuova riga con i nuovi dati
	new_row = {
		'datasetName': rotated_dataset_name,
		'numQuery': original_row['numQuery'],
		'queryArea': original_row['queryArea'],
		'minX': minX,
		'minY': minY,
		'maxX': maxX,
		'maxY': maxY,
		'areaint': original_row['areaint'],
		'cardinality': original_row['cardinality'],
		'executionTime': original_row['executionTime'],
		'mbrTests': original_row['mbrTests'],
		'cardinality_class': original_row['cardinality_class']
	}

	df_range_query = pd.concat([df_range_query, pd.DataFrame([new_row])], ignore_index=True)	# unisco la riga alle altre righe presenti in "path_nameRangeQueriesResult"
	df_range_query.to_csv(path_nameRangeQueriesResult, index=False, sep=';')					# aggiornamento nel file di "path_nameRangeQueriesResult"

# FUNZIONE "update_range_query_file":
# Funzione usata per aggiornare "path_nameRangeQueriesResult" - (no cardinality)
# Input: index --> indice della riga usato per selezionare la riga corretta in "rq_result_file";
# 		 rotated_dataset_name --> nome del dataset ruotato;
# 		 minX, minY, maxX, maxY --> coordinate della finestra ruotate;
# 		 label --> nome del bin;
# 		 path_nameRangeQueriesResult --> percorso del file da aggiornare.
def update_range_query_file_label(index, rotated_dataset_name, minX, minY, maxX, maxY, label, path_nameRangeQueriesResult):
	df_range_query = pd.read_csv(path_nameRangeQueriesResult, delimiter=';')								# lettura del file "path_nameRangeQueriesResult"
	original_row = df_range_query.iloc[index]																# selezione della riga con indice "index"
	potential_last_columns = ['cardinality_class', 'mbrTests_class', 'executionTime_class']					# lista con le intestazioni dell'ultima colonna di "path_nameRangeQueriesResult"
	last_column_name = next((col for col in potential_last_columns if col in original_row), None)			# ricerca del nome effettivo dell'utlima colonna del file "path_nameRangeQueriesResult"
	if last_column_name is None:																			# verifica sulla correttezza del nome trovato
		raise ValueError("<System> None of the potential last column names were found in original_row")

	# generazione di una nuova riga con i nuovi dati
	new_row = {
		'datasetName': rotated_dataset_name,
		'numQuery': original_row['numQuery'],
		'queryArea': original_row['queryArea'],
		'minX': minX,
		'minY': minY,
		'maxX': maxX,
		'maxY': maxY,
		'areaint': original_row['areaint'],
		'cardinality': original_row['cardinality'],
		'executionTime': original_row['executionTime'],
		'mbrTests': original_row['mbrTests'],
		last_column_name: label
	}

	df_range_query = pd.concat([df_range_query, pd.DataFrame([new_row])], ignore_index=True)	# unisco la riga alle altre righe presenti in "path_nameRangeQueriesResult"
	df_range_query.to_csv(path_nameRangeQueriesResult, index=False, sep=';')					# aggiornamento nel file di "path_nameRangeQueriesResult

# FUNZIONE "update_dataset_param":
# Funzione usata per aggiornare "path_nameRangeQueriesResult" - (no cardinality)
# Input: dataset_name --> nome del dataset di partenza
# 		 new_dataset_name --> nome del nuovo dataset generato
# 		 num_features --> numero di geometrie del nuovo dataset
# 		 path_nameSummary --> percorso contenente il sommario dei datasets
# 		 path_nameNewDatasets --> percorso contenente i nuovi datasets generati
def update_dataset_param(dataset_name, new_dataset_name, num_features, path_nameSummary, path_nameNewDatasets):
	df_summary = pd.read_csv(path_nameSummary, delimiter=';')													# leggo il file contenente il sommario dei dataset
	df_newDatasets = pd.read_csv(path_nameNewDatasets, delimiter=';')											# leggo il file contenente il sommario dei datasets nuovi ma già generati

	if new_dataset_name in df_summary['datasetName'].values:													# se il nuovo dataset esiste già nel file ...
		df_summary.loc[df_summary['datasetName'] == new_dataset_name, 'num_features'] = num_features			# ... aggiorno le nuove informazioni sul dataset
		df_newDatasets.loc[df_summary['datasetName'] == new_dataset_name, 'num_features'] = num_features

	else:																										# altrimenti ...
		new_row = pd.DataFrame({																				# genero una nuova riga nel file
			'datasetName': [new_dataset_name],
			'distribution': df_summary.loc[df_summary['datasetName'] == dataset_name, 'distribution'].values,
			'geometry': df_summary.loc[df_summary['datasetName'] == dataset_name, 'geometry'].values,
			'x1': df_summary.loc[df_summary['datasetName'] == dataset_name, 'x1'].values,
			'y1': df_summary.loc[df_summary['datasetName'] == dataset_name, 'y1'].values,
			'x2': df_summary.loc[df_summary['datasetName'] == dataset_name, 'x2'].values,
			'y2': df_summary.loc[df_summary['datasetName'] == dataset_name, 'y2'].values,
			'num_features': [num_features],
			'max_seg': df_summary.loc[df_summary['datasetName'] == dataset_name, 'max_seg'].values,
			'num_points': df_summary.loc[df_summary['datasetName'] == dataset_name, 'num_points'].values,
			'avg_area': df_summary.loc[df_summary['datasetName'] == dataset_name, 'avg_area'].values,
			'avg_side_length_0': df_summary.loc[df_summary['datasetName'] == dataset_name, 'avg_side_length_0'].values,
			'avg_side_length_1': df_summary.loc[df_summary['datasetName'] == dataset_name, 'avg_side_length_1'].values,
			'E0': df_summary.loc[df_summary['datasetName'] == dataset_name, 'E0'].values,
			'E2': df_summary.loc[df_summary['datasetName'] == dataset_name, 'E2'].values
		})
		df_summary = pd.concat([df_summary, new_row], ignore_index=True)										# unisco la riga alle altre righe presenti in "path_nameSummary"
		df_newDatasets = pd.concat([df_newDatasets, new_row], ignore_index=True)								# unisco la riga alle altre righe presenti in "path_nameNewDatasets"

	df_summary.to_csv(path_nameSummary, index=False, sep=';')													# aggiornamento nel file di "path_nameSummary"
	df_newDatasets.to_csv(path_nameNewDatasets, index=False, sep=';')											# aggiornamento nel file di "path_nameNewDatasets"

# FUNZIONE "update_range_query_param":
#
# Input: index -->
# 		 new_dataset_name --> nome del nuovo dataset generato
# 		 cardinality -->
# 		 label -->
# 		 path_nameNewDatasets --> percorso contenente i nuovi datasets generati
def update_range_query_param2(index, new_dataset_name, cardinality, label, path_nameRangeQueriesResult):
	df_range_query = pd.read_csv(path_nameRangeQueriesResult, delimiter=';')							# lettura del file con le range queries già esistenti
	original_row = df_range_query.iloc[index]															# ricerca della range query in questione sfruttando l'indice
	potential_last_columns = ['cardinality_class', 'mbrTests_class', 'executionTime_class']				# potenziali nomi dell'ultima colonna
	last_column_name = next((col for col in potential_last_columns if col in original_row), None)		# leggo il nome dell'ultima colonna della query in questione

	# Lancio un errore in caso di valore non valido
	if last_column_name is None:
		raise ValueError("<System> None of the potential last column names were found in original_row")

	# creazione della nuova riga contenente la nuova query
	new_row = {
		'datasetName': new_dataset_name,
		'numQuery': original_row['numQuery'],
		'queryArea': original_row['queryArea'],
		'minX': original_row['minX'],
		'minY': original_row['minY'],
		'maxX': original_row['maxX'],
		'maxY': original_row['maxY'],
		'areaint': original_row['areaint'],
		'cardinality': cardinality,
		'executionTime': original_row['executionTime'],
		'mbrTests': original_row['mbrTests'],
		last_column_name: label
	}

	df_range_query = pd.concat([df_range_query, pd.DataFrame([new_row])], ignore_index=True)			# unisco la riga alle altre righe presenti in "path_nameRangeQueriesResult"
	df_range_query.to_csv(path_nameRangeQueriesResult, index=False, sep=';')							# aggiornamento nel file di "path_nameRangeQueriesResult"

def update_rq_merge(rq2_row, dsNew_name, dsNew_cardinality, label, path_nameRangeQueriesResult):
	df_range_query = pd.read_csv(path_nameRangeQueriesResult, delimiter=';')							# lettura del file con le range queries già esistenti
	potential_last_columns = ['cardinality_class', 'mbrTests_class', 'executionTime_class']				# potenziali nomi dell'ultima colonna
	last_column_name = next((col for col in potential_last_columns if col in rq2_row), None)		# leggo il nome dell'ultima colonna della query in questione

	# creazione della nuova riga contenente la nuova query
	new_row = {
		'datasetName': dsNew_name,
		'numQuery': rq2_row['numQuery'].iloc[0],
		'queryArea': rq2_row['queryArea'].iloc[0],
		'minX': rq2_row['minX'].iloc[0],
		'minY': rq2_row['minY'].iloc[0],
		'maxX': rq2_row['maxX'].iloc[0],
		'maxY': rq2_row['maxY'].iloc[0],
		'areaint': rq2_row['areaint'].iloc[0],
		'cardinality': dsNew_cardinality,
		'executionTime': rq2_row['executionTime'].iloc[0],
		'mbrTests': rq2_row['mbrTests'].iloc[0],
		last_column_name: label
	}

	df_range_query = pd.concat([df_range_query, pd.DataFrame([new_row])], ignore_index=True)			# unisco la riga alle altre righe presenti in "path_nameRangeQueriesResult"
	df_range_query.to_csv(path_nameRangeQueriesResult, index=False, sep=';')							# aggiornamento nel file di "path_nameRangeQueriesResult"

# -----------------------------------------------------------------------------------------------------------------------------------------------------------


# -----------------------------------------------------------------------------------------------------------------------------------------------------------
# Funzioni usate per applicare la tecnica di RUMORE del dataset!

# FUNZIONE "are_disjoint2":
# Funzione usata per definire se c'è intersezione tra la finsetra di query selezionata e quella delle partizioni
# Input: row --> array contenente, per ciascuna partizione, i valori della propria finestra [xmin, ymin, xmax, ymax];
# 		 minx, miny, maxx, maxy --> valori della finestra di query selezionata.
# Output: (array[boolean]) --> per ciascuna partizione ritorna TRUE se non c'è intersezione, altrimenti ritorna FALSE.
def are_disjoint2(row, minx, miny, maxx, maxy):
	return row['xmax'] < minx or row['xmin'] > maxx or row['ymax'] < miny or row['ymin'] > maxy

















def build_rtree_from_rsgrove(df):
	idx = index.Index()
	for i, row in df.iterrows():
		bbox = (row['xmin'], row['ymin'], row['xmax'], row['ymax'])
		idx.insert(i, bbox)
	return idx

def get_disjoint_partitions(rtree_idx, df, query_box):
	qxmin, qymin, qxmax, qymax = query_box												# dimensione "query box"
	intersecting_ids = list(rtree_idx.intersection((qxmin, qymin, qxmax, qymax)))		# partizioni che intersecano la query
	disjoint_ids = list(set(df.index) - set(intersecting_ids))							# partizioni che non intersecano la query
	return df.loc[disjoint_ids], df.loc[intersecting_ids]

def generate_boxes_parallel(disjoint_df, b, h, num_boxes):
	results = set()

	with Pool(cpu_count()) as pool:
		while(len(results) < num_boxes):
			remaining = num_boxes - len(results)																# geometrie da generare
			tasks = [ (row, b, h) for _, row in disjoint_df.sample(n=remaining, replace=True).iterrows() ]		# argomento da passare alla funzione che parallelizza
			new = pool.map(generate_one_box, tasks)																# restituzione della box generata
			results.update([r for r in new if r is not None])													# aggiungo solo le geometrie valide

	return list(results)

def generate_one_box(args):
	row, b, h = args									# riga del DataFrame "disjoint_df", base e altezza
	new_box = generate_random_box(row, b, h)			# generazione della nuova box
	if new_box != 0:									# se la generazione è andata a buon fine ...
		return ','.join(map(str, new_box)) + '\n'		# ... costruzione della box nel modo corretto
	return None

def remove_boxes_parallel(disjoint_name, intersecting_name, output_path, num_boxes, pathIndexes):
	# calcolo quante geometrie bisogna rimuovere in ciascuna partizione
	disjoint_files = disjoint_name["ID"].tolist()
	intersecting_files = intersecting_name["ID"].tolist()

	base = num_boxes // len(disjoint_files)					# numero di geometrie da rimuovere per ciascuna partizione (parte intera)
	extra = num_boxes % len(disjoint_files)					# geometrie da rimuovere e distribuire tra alcune partizioni (parte decimale)
	remove_plan = {p: base for p in disjoint_files}			# assegnazione a ciascuna partizione del numero di geometrie da rimuovere
	for p in random.sample(disjoint_files, extra):		# aggiunta solo per alcune partizioni di una geometria in più da rimuovere
		remove_plan[p] += 1

	# preparazione delle tasks e invio di quest'ultime per la rimozione delle geometrie
	tasks = [(f, remove_plan[f], pathIndexes) for f in disjoint_files]
	with Pool(cpu_count()) as pool:
		results = pool.starmap(process_partition, tasks)

	# analizzo il ritorno dei risultati
	kept_dfs = []											# geometrie rimaste
	not_removed = 0											# numero di geometrie non rimosse ancora
	for df_kept, leftover in results:
		kept_dfs.append(df_kept)
		not_removed += leftover
	final_df = pd.concat(kept_dfs, ignore_index=True)		# unione dei risultati in un unico dataset

	# rimuovo le geometrie rimanenti direttamente da "final_df"
	if not_removed > 0:
		drop_idx = random.sample(range(len(final_df)), not_removed)		# scelgo random le geometrie da rimuovere
		final_df = final_df.drop(drop_idx)								# rimozione delle geometrie

	# leggo le geometrie presenti nelle partizioni che non intersecano la finestra di query
	intersecting_dfs = []
	for f in intersecting_files:
		df_int = pd.read_csv(os.path.join(pathIndexes, f), header=None)
		intersecting_dfs.append(df_int)

	final_df = pd.concat([final_df] + intersecting_dfs, ignore_index=True)				# concateno lon i risultati dopo la rimozione delle geometrie
	final_df.to_csv(output_path, header=False, index=False, quoting=csv.QUOTE_NONE)		# salvataggio del dataset finale

def process_partition(file_path, to_remove, pathIndexes):
	# Se non ci sono geometrie da rimuovere, ritorno l'intera partizione
	if to_remove <= 0:
		return pd.read_csv(os.path.join(pathIndexes, file_path), header=None), 0

	df = pd.read_csv(os.path.join(pathIndexes, file_path), header=None)		# lettura delle geometrie presenti nella partizione
	remove_count = min(to_remove, len(df))									# se ci sono meno geometrie rispetto al numero da rimuovere, rimuovo quelle possibili
	drop_idx = random.sample(range(len(df)), remove_count)					# scelgo random le geometrie da rimuovere
	df_kept = df.drop(drop_idx)												# rimozione delle geometrie
	return df_kept, (to_remove - remove_count)								# geometrie rimaste, numero geometrie non rimosse











# FUNZIONE "get_dataset_info":
# Funzione usata per estrarre informazioni sul dataset in analisi
# Input: dataset_summary_file --> percorso contenente il sommario in cui ci sono le informazioni sul dataset in analisi;
# 		 dataset_name --> nome del dataset in analisi.
# Output: avg_side_length_0 --> media lato 1;
# 		  avg_side_length_1 --> media lato 2;
# 		  num_features --> numero di geometrie.
def get_dataset_info(dataset_summary_file, dataset_name):
	df_summary = pd.read_csv(dataset_summary_file, delimiter=';')										# lettura del sommario contenente le informazioni sui dataset
	dataset_info = df_summary[df_summary['datasetName'] == dataset_name]								# filtro delle righe in base al "dataset_name" passato
	if len(dataset_info) == 0:																			# verifica che sia stato trovato il dataset in analisi
		raise ValueError(f"No dataset information found for {dataset_name} in the summary file.")

	avg_side_length_0 = dataset_info.iloc[0]['avg_side_length_0']										# estrazione del valore "avg_side_length_0" dal sommario
	avg_side_length_1 = dataset_info.iloc[0]['avg_side_length_1']										# estrazione del valore "avg_side_length_1" dal sommario
	num_features = dataset_info.iloc[0]['num_features']													# estrazione del valore "num_features" dal sommario
	return avg_side_length_0, avg_side_length_1, num_features

# FUNZIONE "count_lines_efficient":
# Funzione che conta quante righe ci sono nel file passato (corrispondono alle geometrie nel dataset)
# Input: file_path --> percorso dove si trova il dataset che stiamo generando.
# Output: sum --> numero di geometrie presenti nel dataset.
def count_lines_efficient(file_path):
	with open(file_path, 'r') as f:
		return sum(1 for line in f)

# FUNZIONE "generate_random_box":
#
# Input: mbr_dataset --> partizione selezionata;
# 		 w --> lunghezza della box
# 		 h --> altezza della box
# Output: xmin, ymin, xmax, ymax --> dimensioni della geometria generata
def generate_random_box(mbr_dataset, w, h):
	xmin_d, ymin_d, xmax_d, ymax_d = mbr_dataset				# dimensione effettiva della finestra della partizione selezionata
	box_width = float(w)										# conversione in float della lunghezza
	box_height = float(h)										# conversione in float dell'altezza

	test = 30													# numero di tentativi massimi di generazione della geometria
	while test>0:
		test = test -1											# decremento tentativi
		xmin = random.uniform(xmin_d, xmax_d - box_width)
		ymin = random.uniform(ymin_d, ymax_d - box_height)
		xmax = xmin + box_width
		ymax = ymin + box_height

		# verifica che il box generato stia dentro la partizione
		if xmax <= xmax_d and xmin >= xmin_d and ymax <= ymax_d and ymin >= ymin_d:
			return xmin, ymin, xmax, ymax
	return 0











def generate_boxes_and_write(output_path, coordinates_summary, b, h, coordinates_rq, num_boxes):
	results = []

	with Pool(cpu_count()) as pool:
		while len(results) < num_boxes:
			remaining = num_boxes - len(results)
			tasks = [(coordinates_summary, b, h, coordinates_rq) for _ in range(remaining)]
			new = pool.map(generate_one_box_no_index, tasks)
			results.extend([r for r in new if r is not None])

	# scrivo tutte le geometrie generate nel file
	if results:
		with open(output_path, 'a') as file:
			file.writelines(results)

	return len(results)

def generate_one_box_no_index(args):
	coordinates_summary, b, h, coordinates_rq = args
	new_box = generate_random_box_no_index(coordinates_summary, b, h, coordinates_rq)
	if new_box != 0:
		return ','.join(map(str, new_box)) + '\n'
	return None

# FUNZIONE "generate_random_box_no_index":
# Funzione che deve generare una geometria che non appartenga alla finestra di query ma che sia dentro alla finestra di dataset (no indice spaziale)
# Input: mbr_dataset --> coordinate della finestra del dataset
# 		 w, h --> lunghezza e altezza della box da generare
# 		 query_mbr --> coordinate della finestra di range query selezionata
# Output: xmin, ymin, xmax, ymax --> dimensioni della geometria generata
def generate_random_box_no_index(mbr_dataset, w, h, query_mbr):
	xmin_d, ymin_d, xmax_d, ymax_d = mbr_dataset					# dimensione della finestra del dataset
	box_width = float(w)											# conversione in float della lunghezza
	box_height = float(h)											# conversione in float dell'altezza
	minX_q, minY_q, maxX_q, maxY_q = query_mbr						# dimensione della finestra di query

	test = 30														# numero di tentativi massimi di generazione della geometria
	while test > 0:
		test -= 1
		xmin = random.uniform(xmin_d, xmax_d - box_width)
		ymin = random.uniform(ymin_d, ymax_d - box_height)
		xmax = xmin + box_width
		ymax = ymin + box_height

		# verifico che la geometria sia effettivamente all'interno della finestra del dataset
		if xmax <= xmax_d and xmin >= xmin_d and ymax <= ymax_d and ymin >= ymin_d:
			# verifico che la geometria sia effettivamente fuori dalla finestra di query
			if xmax <= minX_q or xmin >= maxX_q or ymax <= minY_q or ymin >= maxY_q:
				return xmin, ymin, xmax, ymax

	return 0
# -----------------------------------------------------------------------------------------------------------------------------------------------------------


# -----------------------------------------------------------------------------------------------------------------------------------------------------------
# Funzioni usate per applicare la tecnica di UNIONE del dataset!

def verify_merge(merge_data, datasetName, summary_data):
	result = []

	merge_data = merge_data[merge_data['datasetName'].isin(datasetName)]				# isolo le solo queries legate al dataset in questione
	grouped = merge_data.groupby('datasetName')											# raggruppo le righe per "datasetName"
	sampled_groups = grouped.apply(lambda x: x.sample(1)).reset_index(drop=True)		# seleziono una sola riga random per dataset da quelle risultatnti

	# Se ci sono almeno due righe dopo il filtro, costruisco result, altrimenti lo lascio vuoto
	if len(sampled_groups) > 1:
		for i in range(len(sampled_groups)):										# indice che indicherà il primo dataset per il confornto
			dataset_i = sampled_groups.iloc[i]["datasetName"]						# nome del primo dataset legato alla prima range quey
			window_i = summary_data.loc[summary_data['datasetName'] == dataset_i, ['x1', 'y1', 'x2', 'y2']].iloc[0].tolist()		# finsetra del primo dataset

			for j in range(i + 1, len(sampled_groups)):								# indice che indicherà i dataset successivi da confrontare con il primo
				dataset_j = sampled_groups.iloc[j]["datasetName"]					# nome del secondo dataset legato alla seconda range quey
				window_j = summary_data.loc[summary_data['datasetName'] == dataset_j, ['x1', 'y1', 'x2', 'y2']].iloc[0].tolist()	# finsetra del secondo dataset

				# verifico se le due finestre sono disgiunte o meno
				if are_disjoint(window_i, window_j):
					result.append((dataset_i, dataset_j, 0, 0))
	return result

# FUNZIONE "are_disjoint":
# Funzione usata per definire se c'è intersezione tra le finsetre di dataset dei due datasets selezionati
# Input: mbr1 --> finestra dataset_1
# 		 mbr2 --> finestra dataset_2
# Output: [boolean] --> True, non c'è intersezione, False, c'è intersezione.
def are_disjoint(mbr1, mbr2):
	xmin1, ymin1, xmax1, ymax1 = mbr1		# coordinate finestra dataset_1
	xmin2, ymin2, xmax2, ymax2 = mbr2		# coordinate finestra dataset_2

	# verifica se si sovrappongono completamente le due finestre di dataset
	if xmax1 < xmin2:						# dataset_1 è a sinistra del dataset_2
		return True
	if xmin1 > xmax2:						# dataset_1 è a destra del dataset_2
		return True
	if ymax1 < ymin2:						# dataset_1 è sotto al dataset_2
		return True
	if ymin1 > ymax2:						# dataset_1 è sopra al dataset_2
		return True

	return False							# le due finestre dei dataset si sovrappongono

# FUNZIONE "extract_numbers":
# Funzione usata per estrarre il numero dal nome del dataset
# Input: dataset_name --> nome del dataset (datasetN)
# Output: numbers --> numero
def extract_numbers(dataset_name) -> str:
	number = dataset_name.replace(".csv","")
	numbers = number.replace("dataset", "")
	return numbers

def generate_dataset_merge(pathDatasets, dataset1, dataset2, folder_output):
	# composizione del nome del nuovo dataset combinato
	n1, n2 = extract_numbers(dataset1), extract_numbers(dataset2)			# numero dataset_1 e dataset_2
	dsNew_path = f"{folder_output}/dataset_{n1}_{n2}_combined.csv"			# percorso del file contenente il nuovo dataset
	dsNew_name = f"dataset_{n1}_{n2}_combined"								# nome del file contenente il nuovo dataset

	# se il dataset non esiste già, lo genero
	if not os.path.exists(dsNew_path):
		dataset1_path = f"{pathDatasets}/{dataset1}.csv"					# path primo dataset
		dataset1_csv = pd.read_csv(dataset1_path, sep=',', header=None)		# lettura primo dataset
		dataset2_path = f"{pathDatasets}/{dataset2}.csv"					# path secondo dataset
		dataset2_csv = pd.read_csv(dataset2_path, sep=',', header=None)		# lettura secondo dataset

		# unione dei due dataset e loro salvataggio
		combined_dataset = pd.concat([dataset1_csv, dataset2_csv], ignore_index=True)				# concatenazione dei due datasets
		combined_dataset.to_csv(dsNew_path, index=False, header=False, quoting=csv.QUOTE_NONE)		# salvataggio in un file ".csv"

	return dsNew_name




























def main():
	# ------------------------------------------------------------------------------------------------------------------------------------------------------
	# LETTURA DEL FILE 'augmentationParameters.csv' E SALVATAGGIO DEGLI INPUT:
	# Struttura: 'pathTrainingSet;nameBin;nameSummary;nameRangeQueriesResult;nameInputs;pathDatasets;pathSummaries;nameSummary'
	fileInput = "augmentationParameters.csv"
	print(f"<System> Starting the reading process for file '{fileInput}'!")
	(
		pathTrainingSet,			# percorso contenente i principali file correlati al training set scelto dall'utente
		nameBin,					# file contenente i bin generati
		nameSummary,				# file contenente i dati relativi al dataset in analisi
		nameRangeQueriesResult,		# file contenente le range queries (con risultati) relativi al dataset in analisi
		nameInputs,					# file contenente le richieste dell'utente su cui applicare le tecniche di augmentation
		pathDatasets,				# percorso contenente i datasets
		pathIndexes				# percorso contenente gli indici spaziali
	) = csvReading(fileInput)
	# ------------------------------------------------------------------------------------------------------------------------------------------------------

	# ------------------------------------------------------------------------------------------------------------------------------------------------------
	# CONTROLLO CHE I DATASETS PRESENTI IN "nameSummary" CONTENGANO SOLO BOX:
	# Al momento, l'augmentation funziona solo con datasets contenenti geometrie di tipo box. In caso si debba lavorare con
	# datasets contenenti altri tipi di geometrie (se c'è anche un solo datasets che abbia geometria diversa dalla box),
	# si invia un messaggio di errore e si termina il processo di augmentation!
	try:
		# lettura del file csv contenente tutti i dataset presenti nel seguente training set
		df = pd.read_csv(os.path.join(pathTrainingSet, nameSummary), sep=";")

		# verifica dell'esistenza della colonna "geometry"
		if "geometry" not in df.columns:
			print("<System> Error! The column 'geometry' not exist in the current file...")
			sys.exit(1)

		# controllo dell'esistenza o meno di almeno un valore diverso da 'box'
		if any(df["geometry"] != "box"):
			print("<System> Among the datasets in the selected training set, there is at least one that does not have the 'box' geometry. Finish augmentation!")
			sys.exit(1)

	except Exception as e:
		print(f"<System> Error reading CSV file: {e}")
		sys.exit(1)
	# ------------------------------------------------------------------------------------------------------------------------------------------------------

	# ------------------------------------------------------------------------------------------------------------------------------------------------------
	# GENERAZIONE DEGLI INTERVALLI BIN:
	# Lettura del file 'nameBin' e generazione del rispettivo DataFrame (con controllo esistenza)
	print(f"<System> Starting the reading process for file '{nameBin}'!")
	path_nameBin = os.path.join(pathTrainingSet, nameBin)				# Percorso completo del file
	if not os.path.exists(path_nameBin):								# Verifica esistenza del file
		raise ValueError(f"<System> ERROR! The file '{nameBin}' does not exist in '{pathTrainingSet}'...")

	# Lettura del file 'nameSummary' e generazione del rispettivo DataFrame (con controllo esistenza)
	print(f"<System> Starting the reading process for file '{nameSummary}'!")
	path_nameSummary = os.path.join(pathTrainingSet, nameSummary)		# Percorso completo del file
	if not os.path.exists(path_nameSummary):							# Verifica esistenza del file
		raise ValueError(f"<System> ERROR! The file '{nameSummary}' does not exist in '{pathTrainingSet}'...")

	# Lettura del file 'nameRangeQueriesResult' e generazione del rispettivo DataFrame (con controllo esistenza)
	print(f"<System> Starting the reading process for file '{nameRangeQueriesResult}'!")
	path_nameRangeQueriesResult = os.path.join(pathTrainingSet, nameRangeQueriesResult)		# Percorso completo del file
	if not os.path.exists(path_nameRangeQueriesResult):										# Verifica esistenza del file
		raise ValueError(f"<System> ERROR! The file '{nameRangeQueriesResult}' does not exist in '{pathTrainingSet}'...")

	# caricamento dei file
	bin_result, summary_data, main_data = reload(path_nameBin, path_nameSummary, path_nameRangeQueriesResult)

	# Identifico il parametro categorizzato in analisi (lo prendo dall'ultima colonna di "nameRangeQueriesResult")
	param_to_categorize = main_data.columns[-2].rsplit('_', 1)[0]

	# Identifico i nome di dataset in analisi (solo quelli con la forma "datasetNumber")
	datasetName = []
	with open(path_nameSummary, mode="r", newline="", encoding="utf-8") as file:
		reader = csv.reader(file, delimiter=";")
		next(reader)														# Salta header

		for row in reader:													# Cicolo su ogni riga
			if row:															# Evita eventuali righe vuote
				dataset = row[0].strip()									# Divide la riga in colonne e prende solo il valore della prima
				if "_" not in dataset and dataset not in datasetName:		# Aggiungi solo se non contiene "_" e non è già presente nella lista
					datasetName.append(dataset)								# Aggiunta del dataset nella lista

	# Idemtifico eventuali dataset che possono essere uniti con la tecnica del merge
	merge_table = verify_merge(main_data, datasetName, summary_data)

	# Definizione delle "labels" e delle "num_queries" per ciascuna "labels" tramite l'uso della funzione "create_intervals"
	# labels --> ['0-1', '1-2', '2-3', '3-4', '4-5', '5-6']
	# num_queries --> [3, 5, 2, 8, 11, 7]
	print(f"<System> Generation of Bins for the parameter '{param_to_categorize}'!")
	labels, num_queries = create_intervals(bin_result)

	# Stampa degli intervalli Bins come segue
	# bin0 --> 0-1 | 3
	# bin1 --> 1-2 | 5
	print("         Bin Associations:")
	for index, (label, queries) in enumerate(zip(labels, num_queries)):
		print(f"         bin{index:<2} --> {label} | {queries}")
	print()
	# ------------------------------------------------------------------------------------------------------------------------------------------------------

	# ------------------------------------------------------------------------------------------------------------------------------------------------------
	# VALIDAZIONE DEGLI INPUT INSERITI DALL'UTENTE:
	# Controllo degli input inseriti dall'utente

	print(f"<System> Starting the reading process for file '{nameInputs}'!")
	inputs = []														# Lista dove inserire i valori validi tra gli input dell'utente
	path_nameInputs = os.path.join(pathTrainingSet, nameInputs)		# Percorso completo del file
	if not os.path.exists(path_nameInputs):							# Verifica esistenza del file
		raise ValueError(f"<System> ERROR! The file '{nameInputs}' does not exist in '{pathTrainingSet}'...")


	with open(path_nameInputs, 'r') as file:						# Tentativo di apertura in sola lettura del file "file_path"
		for line in file:											# Cicla su ogni riga del file "file_path"
			user_input = line.strip()								# Salvo il contenuto della riga eliminando spazi e caratteri speciali (come "\n")

			if user_input.lower() == 'end':							# Se l'utente ha scritto "end"...
				break												# ... interruzione ciclo

			try:
				validated_input = validate_input(user_input)		# Verifica della validità dell'iesimo input
				inputs.append(validated_input)						# Se l'input è valido, inserisco nella lista "inputs"
			except ValueError as e:									# Se non è valido, gestisco con la stampa di un errore
				print(f"Invalid input: {e}")

	# Stampa degli intput
	print("         Inputs:")
	for bin_num, num_queries, distribution, augmentation_techniques in inputs:
		print(f"         {bin_num:<6} {num_queries:<8} {distribution:<12} {', '.join(augmentation_techniques)}")
	print()
	# ------------------------------------------------------------------------------------------------------------------------------------------------------

	# ------------------------------------------------------------------------------------------------------------------------------------------------------
	# ANALISI DI CIASCUN INPUT INSERITO DALL'UTENTE:
	# Per ogni riga di input inserita in "inputs", viene fatta l'analisi di augmentation

	print("<System> Processing user inputs!")
	start = time.perf_counter()
	# Analizzo l'iesima riga di input in "inputs" ('bin2', 12, 'uniform', ['noise', 'merge'])
	for count, (bin_num, num_queries, distribution, augmentation_techniques) in enumerate(inputs):
		# Estraggo da "bin_index" il numero del bin ('bin2' --> 2)
		bin_index = int(bin_num[3:])

		# Uso "bin_index" per recuperare l'intervallo Bin corrispondente (2 --> '2-3')
		bin_label = labels[bin_index]

		# Seleziono da "main_data" tutte le righe che hanno come intervallo "bin_label" quello selezionato ('2-3') e che trattino "datasetName"
		bin_data = main_data[(main_data[f'{param_to_categorize}_class'] == bin_label) & (main_data['datasetName'].isin(datasetName))]

		# Seleziono da "main_data" tutte le righe che hanno "bin_label" e "distribution" selezionati ('2-3' e 'uniform') - queries incrementate e queries non incremeeeentate
		dist_data_in = main_data[(main_data[f'{param_to_categorize}_class'] == bin_label) & (main_data['distribution'] == distribution)]
		dist_data = main_data[(main_data[f'{param_to_categorize}_class'] == bin_label) & (main_data['distribution'] == distribution) & (main_data['datasetName'].isin(datasetName))]
		"""
		# --------------------------------------------------------------------------------------------------------------------------------------------------
		# CASO SPECIALE: il numero di queries presente nel bin è pari a 0 - incremento di una queries
		if (len(dist_data) == 0):
			print("<System> Special case: this bin no has queries!")

			print(f"<System> Starting {chosen_technique}...")
			try:
				# SELEZIONE DELLA QUERY DA SFRUTTARE PER LA TECNICA DI AUGMENTATION:
				# Cardinality - Seleziono la query che sia fuori a "bin_label" ma che sia il più vicino possibile a questo intervallo

				# Filtraggio delle Range Queries con "distribution", "cardinality" diversa da zero, che NON appartengano al "bin_label" attuale  e correlate a "datasetName"
				noise_data = main_data[
					(main_data['distribution'] == distribution) &
					(main_data['cardinality'] != 0.0) &
					(main_data['cardinality_class'] != bin_label) &
					(main_data['datasetName'].isin(datasetName))
				]

				noise_data = noise_data.sort_values(by='cardinality', ascending=True)				# Ordinamento dei dati trovati per "cardinality" crescente (da più piccolo a più grande)
				lower_bound, upper_bound = map(float, bin_label.split('-'))							# Estrazione dei due estremi del bin

				# Calcolo di quanto OGNI query sia lontana dagli estremi inferiore e superiore del "bin_label" in analisi
				noise_data['lower_diff'] = abs(noise_data['cardinality'] - lower_bound)				# estremo inferiore --> |cardinality - lower_bound|
				noise_data['upper_diff'] = abs(noise_data['cardinality'] - upper_bound)				# estremo superiore --> |cardinality - upper_bound|
				noise_data['total_diff'] = noise_data[['lower_diff', 'upper_diff']].sum(axis=1)		# somma delle due differenze
				noise_data['min_diff'] = noise_data[['lower_diff', 'upper_diff']].min(axis=1)		# calcolo la differenza più piccola tra i due valori
				noise_data = noise_data.sort_values(by='min_diff')									# riordino in base alla differenza più piccola

				selected_row = noise_data.iloc[0]													# seleziono la prima riga, quella più vicina all'intervallo "bin_label"

				if

				else:
							print("<System> No appropriate noise data found.")







			except Exception as e:
				print(f"<System> An error occurred: {e}")
				if os.path.exists(output_path):
					os.remove(output_path)
					print(f"<System> Removed file at {output_path} due to error.")

"""




		# --------------------------------------------------------------------------------------------------------------------------------------------------
		# CASO 1: il numero di queries richiesto è già pari al numero di queries presenti nel bin selezionato - FINITO
		if len(dist_data_in) == num_queries:
			print(f"PROCESSING INPUT {count}! Required for this bin {num_queries} queries with {distribution} distribution.")
			print(f"This bin already has {num_queries} queries with distribution {distribution}.")

		# --------------------------------------------------------------------------------------------------------------------------------------------------
		# CASO 2: il numero di queries richiesto è inferiore al numero di queries presenti nel bin selezionato - DECREMENTO QUERIES
		elif len(dist_data_in) > num_queries:
			print()
			print("----------------------------------------------------------------------------------------------------")
			print(f"PROCESSING INPUT {count}! Required for this bin {num_queries} queries with {distribution} distribution.")
			print(f"This bin requires deleting {len(dist_data_in) - num_queries} queries.")

			# divisione tra queries che devono rimanere e queries che devono essere eliminate
			to_remove = dist_data_in.tail(len(dist_data_in) - num_queries)								# prende le ultime "len(dist_data_in) - num_queries" queries che sono in eccesso, da rimuovere
			main_data = main_data.drop(to_remove.index)													# rimozione delle righe in eccesso da "main_data"
			main_data.to_csv(path_nameRangeQueriesResult, index=False, sep=';')							# aggiornamento di "nameRangeQueriesResult"
			print(f"Kept {num_queries} queries with distribution {distribution} in bin {bin_index}")


			# Rimozione dei datasets che non vengono più usati nelle queries rimaste
			datasets_to_remove = to_remove['datasetName'].unique()										# estrazione datasets riguardanti le righe rimosse
			remaining_datasets = main_data['datasetName'].unique()										# estrazione datasets riguardanti le righe ancora presenti
			datasets_to_remove = [ds for ds in datasets_to_remove if ds not in remaining_datasets]		# confronto e lasio in "datasets_to_remove" i datasets non presenti in "main_data"
			summary_data = summary_data[~summary_data['datasetName'].isin(datasets_to_remove)]			# rimozione da "summary_data" dei datasets non presenti più in "main_data"
			summary_data.to_csv(path_nameSummary, index=False, sep=';')									# aggiornamento di "nameSummary"
			update_bin(bin_label, num_queries, path_nameBin)											# aggiornamento di "nameBin"

			# aggiornamneto delle strutture usate
			bin_result, summary_data, main_data = reload(path_nameBin, path_nameSummary, path_nameRangeQueriesResult)

		# --------------------------------------------------------------------------------------------------------------------------------------------------
		# CASO 3: il numero di queries richiesto è maggiore al numero di queries presenti nel bin selezionato - INCREMENTO QUERIES
		elif len(dist_data_in) < num_queries:
			print()
			print("----------------------------------------------------------------------------------------------------")
			print(f"PROCESSING INPUT {count + 1}! Required for this bin {num_queries} queries with {distribution} distribution.")
			print(f"This bin requires augmentation of {num_queries - len(dist_data_in)} queries.")

			path_nameNewDatasets = os.path.join(pathTrainingSet, 'new_datasets.csv')								# generazione del path per il file "new_datasets.csv"
			if not os.path.isfile(path_nameNewDatasets):
				with open(path_nameSummary, 'r') as file_R, open(path_nameNewDatasets, 'w') as file_W:				# apertura dei file "path_nameSummary" e "path_nameNewDatasets"
					header = file_R.readline()																		# legge la prima riga del file "path_nameSummary"
					file_W.write(header)																			# inserisce "header" nel file "path_nameNewDatasets"

			named_distribution_count = dist_data_in[dist_data_in['distribution'] == distribution].shape[0]
			num_queries = num_queries - named_distribution_count		# calcolo il numero di queries che dovranno essere inserite
			num_queries_inserted = 0									# variabile contatore per sapere il numero di queries nuove inserite

			# Ciclo, potenzialmente infinito, che verrà interrotto da "break" quando saranno stati generati abbastanza dati
			while True:
				remaining = num_queries - num_queries_inserted									# calcolo quante queries devo ancora essere generare
				print()
				print(f"<System> Generating the number query {num_queries_inserted + 1}:")

				if len(dist_data) != 0:
					row = dist_data.sample(n=1).iloc[0]		# estrazione di una riga casuale da "dist_data" che sarà la base su cui applicare la tecnica di "augmentation"
					file_index = row.name					# salvataggio dell'indice della riga in questione
					dataset_name = row['datasetName']		# nome del dataset da modificare o duplicare

				# definizione della cartella dove caricare i datasets generati dalle tecniche di augmentation! Se la cartella non esiste, la creo
				folder_output = os.path.join("datasetsAugmentation", '/'.join(pathTrainingSet.split('/')[1:]))
				if not os.path.exists(folder_output):
					os.makedirs(folder_output)

				# Le tecniche di augmentation vengono selezionate in base a probabilità pesate
				if len(dist_data) == 0:
					probabilities = {
						"rotation": 0.0,	# 0% chance
						"noise": 1.0,		# 100% chance
						"merge": 0			# 0% chance
					}
				elif len(datasetName) == 1:		# ... se ho solo un dataset, non ha senso fare il "merge" (per usare il "merge", c'è bisogno di almeno due datasets)
					probabilities = {
						#"rotation": 0.6,	# 60% chance
						#"noise": 0.4,		# 40% chance
						"rotation": 0.1,
						"noise": 0.9,
						"merge": 0			# 0% chance
					}
				else:
					probabilities = {
						#"rotation": 0.5,	# 50% chance
						#"noise": 0.4,		# 40% chance
						"rotation": 0.1,
						"noise": 0.8,
						"merge": 0.1		# 10% chance
					}

				"""
				# Si può modificare dinamicamente le probabilità in base al parametro in analisi, ad esempio evitando il "merge" per la "cardinality"
				if param_to_categorize == "cardinality":
					probabilities["merge"] = 0			# 0% chance for merge if categorizing by cardinality
					probabilities["rotation"] = 0.60
					probabilities["noise"] = 0.40
				"""
				# Selezione di una tecnica casuale pesata
				chosen_technique = random.choices(list(probabilities.keys()), weights=list(probabilities.values()))[0]
				#chosen_technique = "noise"
				print(f"<System> The technique used for augmentation is '{chosen_technique}'.")

				# -------------------------------------------------------------------------------------------------------------------------------------------
				# PRIMA TECNICA DI AUGMENTATION - "ROTATION"
				if chosen_technique == 'rotation':
					print(f"<System> Starting {chosen_technique}...")
					try:
						tent = 0
						while True:
							degree = generate_random_degree()														# generazione dell'angolo di rotazione (es. 91.7)

							# Costruzione dei path dei dataset in output (dataset e indice spaziale)
							degree_str = str(degree).replace('.', '_')												# stringa contenente l'angolo di rotazione (sostituisco '.' con '_')
							new_dataset_name = f'{dataset_name}_rotated_{degree_str}.csv'							# nome del nuovo dataset ruotato: "dataset02_rotated_91_7.csv"
							output_ds = os.path.join(folder_output, new_dataset_name)								# percorso dove salvare il nuovo dataset: "../dataset02_rotated_91_7.csv"
							tent = tent + 1

							if not os.path.exists(output_ds):														# esco dal ciclo solo se ho generato un angolo già esistente
								break
							print(f"<System> Skipped! Rotated dataset file '{dataset_name}_rotated_{degree_str}' already exists.")

						if tent != 21:
							rotated_dataset_name = new_dataset_name.rsplit('.', 1)[0]							# nome del dataset ruotato di "degree" senza estensione
							output_ds, nrem = rotate_dataset(dataset_name, pathIndexes, output_ds, degree)		# rotazione dataset - restituisce l'eventuale numero di geometrie rimosse

							x1, y1, x2, y2 = get_coordinates(path_nameSummary, dataset_name)					# funzione usata per ricavare le massime coordinate del dataset in questione
							nf = get_features(path_nameSummary, dataset_name)									# funzione usata per ricavare il numero di geometrie nel dataset in questione
							res = float(nf) - float(nrem)														# numero di geometrie effettive nel nuovo dataset generato

							rotated_x1, rotated_y1, rotated_x2, rotated_y2 = rotate_window(x1, y1, x2, y2, degree)			# rotazione della finestra del dataset

							# aggiornamento delle caratteristiche del dataset in "nameSummary" e in "new_datasets.csv"
							update_dataset_summary(dataset_name, rotated_dataset_name, rotated_x1, rotated_y1, rotated_x2, rotated_y2, res, path_nameSummary, path_nameNewDatasets)

							print(f"<System> Rotated Range Query by {degree}")
							minX, minY, maxX, maxY = get_coordinates_rq(path_nameRangeQueriesResult, file_index)					# ricerca delle coordinate della finestra di range query da ruotare
							rotated_x1r, rotated_y1r, rotated_x2r, rotated_y2r = rotate_window(minX, minY, maxX, maxY, degree)		# rotazione della finestra di range query

							# Aggiornamento del file "path_nameRangeQueriesResul" con le nuove queries
							if param_to_categorize == "cardinality":
								update_range_query_file(file_index, rotated_dataset_name, rotated_x1r, rotated_y1r, rotated_x2r, rotated_y2r, path_nameRangeQueriesResult)
							else:
								update_range_query_file_label(file_index, rotated_dataset_name, rotated_x1r, rotated_y1r, rotated_x2r, rotated_y2r, bin_label, path_nameRangeQueriesResult)
							print("<System> The 'rotation' operation for the following query has finished")

					except Exception as e:
						print(f"<System> An error occurred: {e}")
						num_queries_inserted -= 1
				# -------------------------------------------------------------------------------------------------------------------------------------------

				# -------------------------------------------------------------------------------------------------------------------------------------------
				# SECONDA TECNICA DI AUGMENTATION - "NOISE"
				elif chosen_technique == 'noise':
					print(f"<System> Starting {chosen_technique}...")
					try:
						# SELEZIONE DELLA QUERY DA SFRUTTARE PER LA TECNICA DI AUGMENTATION:
						# Cardinality - Seleziono la query che sia fuori a "bin_label" ma che sia il più vicino possibile a questo intervallo
						if param_to_categorize == "cardinality":

							# Filtraggio delle Range Queries con "distribution", "cardinality" diversa da zero, che NON appartengano al "bin_label" attuale  e correlate a "datasetName"
							noise_data = main_data[
								(main_data['distribution'] == distribution) &
								(main_data['cardinality'] != 0.0) &
								(main_data['cardinality_class'] != bin_label) &
								(main_data['datasetName'].isin(datasetName))
							]

							noise_data = noise_data.sort_values(by='cardinality', ascending=True)				# Ordinamento dei dati trovati per "cardinality" crescente (da più piccolo a più grande)
							lower_bound, upper_bound = map(float, bin_label.split('-'))							# Estrazione dei due estremi del bin

							# Calcolo di quanto OGNI query sia lontana dagli estremi inferiore e superiore del "bin_label" in analisi
							noise_data['lower_diff'] = abs(noise_data['cardinality'] - lower_bound)				# estremo inferiore --> |cardinality - lower_bound|
							noise_data['upper_diff'] = abs(noise_data['cardinality'] - upper_bound)				# estremo superiore --> |cardinality - upper_bound|
							noise_data['total_diff'] = noise_data[['lower_diff', 'upper_diff']].sum(axis=1)		# somma delle due differenze
							noise_data['min_diff'] = noise_data[['lower_diff', 'upper_diff']].min(axis=1)		# calcolo la differenza più piccola tra i due valori
							noise_data = noise_data.sort_values(by='min_diff')									# riordino in base alla differenza più piccola

							selected_row = noise_data.iloc[0]													# seleziono la prima riga, quella più vicina all'intervallo "bin_label"

						# No Cardinality - seleziono una qualsiasi tra le queries appartenenti a "bin_label"
						else:
							existing_column = f"{param_to_categorize}_class"		# variabile di supporto per selezionare la colonna corretta con le label

							# Filtraggio delle Range Queries con "distribution", che appartengano al "bin_label" attuale e correlate a "datasetName"
							noise_data = main_data[
								(main_data['distribution'] == distribution) &
								(main_data[existing_column] == bin_label) &
								(main_data['datasetName'].isin(datasetName))
							]

							selected_row = noise_data.sample(n=1).iloc[0]			# seleziono una singola query casuale da "noise_data"

						if not noise_data.empty:
							file_index = selected_row.name															# seleziono l'indice della query selezionata (diverso dal numero della query)
							selected_cardinality = selected_row['cardinality']										# seleziono la cardinalità della query selezionata (la più piccola di quel bin per costruzione di "selected_row")
							dataset_name = selected_row['datasetName']												# seleziono il nome relativo al dataset su cui è stata applicata la query selezionata
							file_path = os.path.join(pathIndexes,f'{dataset_name}_spatialIndex/_master.rsgrove')	# caricamento cartella contenente la tabella ricapitolativa sull'indice spaziale correlato al dataset in questione

							# controllo esistenza dell'indice spaziale
							try:
								df = pd.read_csv(file_path)											# tentativo di apertura di "file_path"
							except FileNotFoundError:												# se il file non viene aperto correttamente, stampa messaggio di errore
								print("File not found. Exiting.")

							df = pd.read_csv(file_path, delim_whitespace=True, skiprows=0)			# lettura della tabella ricapitolativa dell'indice spaziale
							coordinates_df = df[['xmin', 'ymin', 'xmax', 'ymax']]					# estrazione delle coordinate delle finestre di ciascuna partizione del dataset in questione
							name_df = df[['ID']]													# estrazione dei nomi di ciascuna partizione del dataset in questione
							minX = selected_row['minX']												# estrazione di minX della finestra correlata alla range query scelta
							minY = selected_row['minY']												# estrazione di minY della finestra correlata alla range query scelta
							maxX = selected_row['maxX']												# estrazione di maxX della finestra correlata alla range query scelta
							maxY = selected_row['maxY']												# estrazione di maxY della finestra correlata alla range query scelta

							# mantengo solo le partizioni che sono disgiunte rispetto la range query selezionata (che non intersecano la finestra di query selezionata)
							rtree_idx = build_rtree_from_rsgrove(coordinates_df)																		# indice delle partizioni "itelligente" - finestre partizioni
							rtree_idx_name = build_rtree_from_rsgrove(coordinates_df)																	# indice delle partizioni "itelligente" - nomi partizioni
							disjoint_df, intersecting_df = get_disjoint_partitions(rtree_idx, coordinates_df, (minX, minY, maxX, maxY))					# partizioni disgiunte rispetto alla finestra di query, partizioni intersecanti la finestra di query (finestre)
							disjoint_name, intersecting_name = get_disjoint_partitions(rtree_idx_name, name_df, (minX, minY, maxX, maxY))				# partizioni disgiunte rispetto alla finestra di query, partizioni intersecanti la finestra di query (nomi)
							input_dataset = os.path.join(pathDatasets,f'{dataset_name}.csv')															# dataset selezionato
							max_index = 0 																												# inizializzazione di "max_index"

							# controllo la cartella contenente tutti i datasets già generati con le tecniche di augmentation
							for file_name_d in os.listdir(folder_output):
								if file_name_d.startswith(selected_row['datasetName']):					# se tra i datasets nella cartella c'è uno che inizi con il nome del dataset selezionato
									try:
										index = int(file_name_d.split("_noise_")[-1].split(".")[0])		# controllo se all'interno del nome ci sia la dicitura "noise" e ne isolo l'indice
										max_index = max(max_index, index)								# prendo l'indice più alto tra quello trovato e quello slavato in memoria
									except ValueError:													# se non c'è "noise" nel nome, skippare dataset
										pass
							output_dataset = f"{dataset_name}_noise_{max_index + 1}.csv"				# nome del nuovo dataset generato con la tencnica di "noise"
							output_path = os.path.join(folder_output, output_dataset)					# percorso di salvataggio completo del nuovo dataset

							with open(input_dataset, 'r') as input_file:								# apertura del file contenente il dataset in analisi
								content = input_file.read()												# lettura e caricamento in "content" del dataset in analisi
							with open(output_path, 'w') as output_file:									# apertura del file dove scrivere il nuovo dataset
								output_file.write(content)												# copia del dataset in analisi ("content") nel file che conterrà il nuovo dataset

							# capisco se dovrò aumentare o diminuire la cardinalità
							if param_to_categorize == "cardinality" or len(dist_data) == 0:
								if selected_cardinality > float(bin_label.split("-")[0]):				# in selected_cardinality ho una cardinalità o subito sopra o subito sotto al bin in analisi
									operation = "decrease"												# ... se subito SOPRA devo DECREMENTARE
								else:
									operation = "increase"												# ... se subito SOTTO devo INCFEMENTARE

							# ricerca di informazioni sul dataset selezionato (b = media lato 0, h = media lato 1, num_features = geometrie)
							b, h, num_features = get_dataset_info(path_nameSummary, dataset_name)
							count_geom_tot = count_lines_efficient(output_path)							# numero di geometrie nel dataset
							count_inside = count_geom_tot * selected_cardinality						# numero geometrie nella query: numero geometrie totali * numero geometria nella query

							try:
								x1, y1, x2, y2 = get_coordinates(path_nameSummary, dataset_name)			# ricerca delle coordinate della finestra del dataset
								coordinates_summary = (x1, y1, x2, y2)										# coordinate finestra del dataset
								coordinates_rq = (minX, minY, maxX, maxY)									# coordinate finestra di range query selezionata

								# parametro categorizzato - "cardinality"
								if param_to_categorize == "cardinality" or len(dist_data) == 0:
									print(f"<System> Noised dataset by '{operation}' geometries: '{output_path}'")

									#label = selected_row['cardinality_class']								# cerco i valori del bin
									#lower_bound, upper_bound = label.split('-')								# divido il bin in valore minimo e valore massimo
									lower_bound, upper_bound = bin_label.split("-")								# divido il bin in valore minimo e valore massimo
									delta = random.uniform(0, float(upper_bound)-float(lower_bound))		# valore random che sia tra l'intervallo bin in analisi

									#if(float(upper_bound) == 0.7):
									#	delta = random.uniform(0, 0.15)

									# operazione di decremento
									if operation == "decrease":
										bound = float(upper_bound) - float(delta)							# valore random nel bin corrente (calcolato da "upper_bound")

										# calcolo il numero di geometrie che vanno aggiunte per diminuire la cardinalità (max evita numeri negativi, ceil arrotonda per eccesso)
										num_boxes = max(0, math.ceil((count_inside - bound * count_geom_tot) / bound))
										selected_cardinality = count_inside / (count_geom_tot + num_boxes)	# cardinalità finale dopo l'operazione di decremento
										count_geom_tot = count_geom_tot + num_boxes							# numero di geometrie totali dopo l'operazione di decremento

										print(f"<System> Number of geometries to generate for the 'decrease' operation: {num_boxes}")

										# genero il numero di box richiesto (in parallelo per velocizzare il programma)
										if not disjoint_df.empty:												# caso in cui ci sono partizioni che non intersecano la finestra di query
											new_boxes = generate_boxes_parallel(disjoint_df, b, h, num_boxes)	# lista di geometrie aggiunte
											with open(output_path, 'a') as file:								# apertura del dataset in output
												file.writelines(new_boxes)										# salvataggio delle nuove geometrie
										if disjoint_df.empty:													# caso in cui non ci sono partizioni che non intersecano la finestra di query
											generate_boxes_and_write(output_path, coordinates_summary, b, h, coordinates_rq, num_boxes)

									# operazione di incremento
									else:
										bound = float(lower_bound) + delta									# valore random nel bin corrente (calcolato da "lower_bound")

										# calcolo il numero di geometrie che vanno rimosse per aumentare la cardinalità (max evita numeri negativi, ceil arrotonda per eccesso)
										num_boxes = max(0, math.ceil((bound * count_geom_tot - count_inside) / bound))
										selected_cardinality = count_inside / (count_geom_tot - num_boxes)	# cardinalità finale dopo l'operazione di incremento
										count_geom_tot = count_geom_tot - num_boxes							# numero di geometrie totali dopo l'operazione di incremennto

										print(f"<System> Number of geometries to remove for the 'increase' operation: {num_boxes}")

										if not disjoint_df.empty:																																# caso in cui ci sono partizioni che non intersecano la finestra di query
											remove_boxes_parallel(disjoint_name, intersecting_name, output_path, num_boxes, os.path.join(pathIndexes,f'{dataset_name}_spatialIndex'))			# rimozione delle geometrie e salvataggio del nuovo dataset

										if disjoint_df.empty:													# caso in cui non ci sono partizioni che non intersecano la finestra di query
											checked_lines = set()												# terrà traccia degli indici già controllati
											removed_lines = set()												# terrà traccia degli indici delle geometrie da rimuovere per incrementare "cardinality"

											# continuo a ciclare finchè la cardinalità non si alza, rimuovendo geometrie all'esterno della finestra di range query
											while float(selected_cardinality) < bound:

												line_index = random.randint(0, count_geom_tot - 1)		# seleziono una geometria random
												if line_index in checked_lines:							# controllo se è già stata controllata, in caso la saltiamo
													continue
												checked_lines.add(line_index)							# aggiorno "checked_lines"
												removed_geometry = lines[line_index]					# aggiorno "removed_geometry"

												# estrazione delle coordinate della geometria scelta
												xmin, ymin, xmax, ymax = map(float, removed_geometry.strip().split(','))

												# se la geometria è fuori dalla finestra di query, la elimino e decremento il numero di geometrie da rimuovere
												if (xmax <= coordinates_rq[0] or xmin >= coordinates_rq[2] or
													ymax <= coordinates_rq[1] or ymin >= coordinates_rq[3]):
													removed_lines.add(line_index)
													count_geom_tot -= 1

												selected_cardinality = count_inside / count_geom_tot	# incremento della cardinalità

												# se abbiamo controllato tutte le geometrie disponibili, usciamo
												if len(checked_lines) >= count_geom_tot:
													break

												# generatore che produce tutte le linee non rimosse
												def filtered_lines():
													for i, line in enumerate(lines):
														if i not in removed_lines:
															yield line

											# Scrittura del file di output
											chunk_size = 1024						# Adjust the chunk size as needed
											with open(output_path, 'w') as file:
												buffer = []
												for line in filtered_lines():
													buffer.append(line)
													if len(buffer) >= chunk_size:
														file.writelines(buffer)
														buffer = []
												if buffer:
													file.writelines(buffer)

								# parametro categorizzato - "executionTime" o "mbrTests"
								else:
									ops = ["increase", "decrease"]											# possibili operazioni per mutare il parametro da categorizzare (aumentare o diminuire il numero di geometrie nel dataset)
									operation = random.choice(ops)											# scelta random di una delle due operazioni
									random_percentage = random.uniform(5, 20)								# si calcola una percentuale random tra il 5% e il 20%
									number = int(num_features * (random_percentage / 100))					# si calcola quante geometrie corrispondono a quella percentuale rispetto il numero totale di geometrie originali

									# operazione di decremento
									if operation == "decrease":
										print(f"<System> Number of geometries to generate for the 'decrease' operation: {number}")
										selected_cardinality = count_inside / (count_geom_tot + number)		# cardinalità finale dopo l'operazione di decremento
										count_geom_tot = count_geom_tot + number							# numero di geometrie totali dopo l'operazione di decremento

										# genero il numero di box richiesto (in parallelo per velocizzare il programma)
										if not disjoint_df.empty:												# caso in cui ci sono partizioni che non intersecano la finestra di query
											new_boxes = generate_boxes_parallel(disjoint_df, b, h, number)		# lista di geometrie aggiunte
											with open(output_path, 'a') as file:								# apertura del dataset in output
												file.writelines(new_boxes)										# salvataggio delle nuove geometrie
										if disjoint_df.empty:													# caso in cui non ci sono partizioni che non intersecano la finestra di query
											generate_boxes_and_write(output_path, coordinates_summary, b, h, coordinates_rq, number)

									# operazione di incremento
									else:
										print(f"<System> Number of geometries to remove for the 'increase' operation: {number}")
										selected_cardinality = count_inside / (count_geom_tot - number)		# cardinalità finale dopo l'operazione di incremento
										count_geom_tot = count_geom_tot - number							# numero di geometrie totali dopo l'operazione di incremento

										if not disjoint_df.empty:																															# caso in cui ci sono partizioni che non intersecano la finestra di query
											remove_boxes_parallel(disjoint_name, intersecting_name, output_path, number, os.path.join(pathIndexes,f'{dataset_name}_spatialIndex'))			# rimozione delle geometrie e salvataggio del nuovo dataset

										if disjoint_df.empty:
											# lettura del dataset di output e inserimento in un DataFrame, riga per riga
											with open(output_path, 'r') as file:
												lines = file.readlines()

											checked_lines = set()												# terrà traccia degli indici già controllati
											removed_lines = set()												# terrà traccia degli indici delle geometrie da rimuovere per incrementare "cardinality"

											# continuo a ciclare finchè non sarranno state rimosse il numero di geometrie richiesto
											while number > 0:
												if count_geom_tot == 0:
													break

												line_index = random.randint(0, count_geom_tot - 1)		# seleziono una geometria random
												if line_index in checked_lines:							# controllo se è già stata controllata, in caso la saltiamo
													continue
												checked_lines.add(line_index)							# aggiorno "checked_lines"
												removed_geometry = lines[line_index]					# aggiorno "removed_geometry"

												# estrazione delle coordinate della geometria scelta
												xmin, ymin, xmax, ymax = map(float, removed_geometry.strip().split(','))

												# se la geometria è fuori dalla finestra di query, la elimino dal dataset e decremento il numero di geometrie da rimuovere
												if xmax <= coordinates_rq[0] or xmin >= coordinates_rq[2] or ymax <= coordinates_rq[1] or ymin >= coordinates_rq[3]:
													lines.pop(line_index)
													count_geom_tot -= 1
													number -= 1

												selected_cardinality = count_inside / count_geom_tot

											# Riscrittura del dataset con le geometrie rimaste
											with open(output_path, 'w') as file:
												file.writelines(lines)

								# aggiornamento dei file
								new_dataset_name = str(output_dataset).replace('.csv', '')											# nome nuovo dataset, senza estensione ".csv"
								update_dataset_param(dataset_name, new_dataset_name, count_geom_tot, path_nameSummary, path_nameNewDatasets)
								if param_to_categorize == "cardinality":
									update_range_query_param2(file_index, new_dataset_name, selected_cardinality, bin_label, path_nameRangeQueriesResult)
								else:
									update_range_query_param2(file_index, new_dataset_name, selected_cardinality, bin_label, path_nameRangeQueriesResult)

								print("<System> The 'noise' operation for the following query has finished")

							except subprocess.CalledProcessError as e:
								print(f"<System> Error applying noise to dataset '{output_path}': {e}")

						else:
							print("<System> No appropriate noise data found.")

					except Exception as e:
						print(f"<System> An error occurred: {e}")
						if os.path.exists(output_path):
							os.remove(output_path)
							print(f"<System> Removed file at {output_path} due to error.")

						num_queries_inserted -= 1
				# -------------------------------------------------------------------------------------------------------------------------------------------

				# -------------------------------------------------------------------------------------------------------------------------------------------
				# TERZA TECNICA DI AUGMENTATION - "MERGE"

				elif chosen_technique == 'merge':
					try:
						finish = False
						# sfrutto le coppie di dataset disgiunti
						for idx, (dataset1, dataset2, fleg1, fleg2) in enumerate(merge_table):

							if int(fleg1) == 1 and int(fleg2) == 1:
								continue

							print(f"<System> Let's analyze '{dataset1}' and '{dataset2}'!")
							tent = 0
							finish = False
							ds1_features = summary_data.loc[summary_data['datasetName'] == dataset1, "num_features"].iloc[0]		# numero di geometrie presenti in "dataset1"
							ds2_features = summary_data.loc[summary_data['datasetName'] == dataset2, "num_features"].iloc[0]		# numero di geometrie presenti in "dataset2"
							dsNew_features = ds1_features + ds2_features															# numero di geometrie presenti nel nuovo dataset
							bin_label = row['cardinality_class']																	# cerco i valori del bin
							lower_bound, upper_bound = map(float, bin_label.split('-'))												# divido il bin in valore minimo e valore massimo

							# se il parametro categorizzato è "cardinality" devo fare un controllo sul nuovo parametro di cardinalità
							if param_to_categorize == "cardinality":
								# se "fleg1" è zero, posso analizzare le range queries legate al primo dataset
								if int(fleg1) == 0:
									# aggiorno "fleg1" così da non ricontrollarlo più
									fleg1 = 1
									merge_table[idx] = (dataset1, dataset2, fleg1, fleg2)

									# analizzo 20 queries
									tent = 0
									while tent != 20:
										rq1_row = dist_data[dist_data['datasetName'] == dataset1].sample(1).reset_index(drop=True)					# seleziono una sola range query correlata al dataset selezionato
										rq1_cardinality = rq1_row["cardinality"].iloc[0]															# seleziono la cardinalità della query scelta
										rq1_features = rq1_cardinality * ds1_features																# numero di geometrie nella range query selezionata
										dsNew_cardinality = rq1_features / dsNew_features															# nuova cardinalità
										if lower_bound <= dsNew_cardinality <= upper_bound:															# se rientra nel bin selezionato, allora ho trovato i candidati giusti
											print("<System> A query was found that met the required parameters. Saving the new combined dataset.")
											dsNew_name = generate_dataset_merge(pathDatasets, dataset1, dataset2, folder_output)					# generazione del nuovo dataset
											update_dataset_param(dataset1, dsNew_name, dsNew_features, path_nameSummary, path_nameNewDatasets)
											update_rq_merge(rq1_row, dsNew_name, dsNew_cardinality, bin_label, path_nameRangeQueriesResult)
											finish = True
											break
										tent += 1

								# altrimenti analizzo le range queries legate al secondo dataset
								if int(fleg2) == 0 and not finish:
									# aggiorno "fleg2" così da non ricontrollarlo più
									fleg2 = 1
									merge_table[idx] = (dataset1, dataset2, fleg1, fleg2)

									# analizzo 20 queries
									tent = 0
									while tent != 20:
										rq2_row = dist_data[dist_data['datasetName'] == dataset2].sample(1).reset_index(drop=True)					# seleziono una sola range query correlata al dataset selezionato
										rq2_cardinality = rq2_row["cardinality"].iloc[0]															# seleziono la cardinalità della query scelta
										rq2_features = rq2_cardinality * ds2_features																# numero di geometrie nella range query selezionata
										dsNew_cardinality = rq2_features / dsNew_features															# nuova cardinalità
										if lower_bound <= dsNew_cardinality <= upper_bound:															# se rientra nel bin selezionato, allora ho trovato i candidati giusti
											print("<System> A query was found that met the required parameters. Saving the new combined dataset.")
											dsNew_name = generate_dataset_merge(pathDatasets, dataset1, dataset2, folder_output)					# generazione del nuovo dataset
											update_dataset_param(dataset2, dsNew_name, dsNew_features, path_nameSummary, path_nameNewDatasets)
											update_rq_merge(rq2_row, dsNew_name, dsNew_cardinality, bin_label, path_nameRangeQueriesResult)
											finish = True
											break
										tent += 1

							# se il parametro categorizzato non è "cardinality", posso proseguire liberamente con il marge
							else:
								rq_row = dist_data[dist_data['datasetName'] == dataset1].sample(1).reset_index(drop=True)							# seleziono una sola range query correlata al dataset selezionato
								rq_cardinality = rq_row["cardinality"].iloc[0]																		# seleziono la cardinalità della query scelta
								rq_features = rq_cardinality * ds1_features																			# numero di geometrie nella range query selezionata
								dsNew_cardinality = rq_features / dsNew_features																	# nuova cardinalità
								print("<System> A query was found that met the required parameters. Saving the new combined dataset.")
								dsNew_name = generate_dataset_merge(pathDatasets, dataset1, dataset2, folder_output)								# generazione del nuovo dataset
								update_dataset_param(dataset1, dsNew_name, dsNew_features, path_nameSummary, path_nameNewDatasets)
								update_rq_merge(rq_row, dsNew_name, dsNew_cardinality, bin_label, path_nameRangeQueriesResult)
								finish = True

							if finish:
								break

						if not finish:
							num_queries_inserted -= 1
							print("<System> Merge is not possible!")
						else:
							print("<System> Merge completed.")

					except Exception as e:
						print(f"<System> An error occurred: {e}")
						num_queries_inserted -= 1








				# aggiornamneto delle strutture usate
				bin_result, summary_data, main_data = reload(path_nameBin, path_nameSummary, path_nameRangeQueriesResult)

				# Incremento del counter delle queries processate
				num_queries_inserted += 1

				# Verifica se siano state o meno processate tutte le queries mancanti e, in caso affermativo, aggiorno i nuovi bin e passo al prossimo input
				if num_queries_inserted >= num_queries:
					update_bin(bin_label, len(dist_data_in) + num_queries_inserted, path_nameBin)
					break

		# --------------------------------------------------------------------------------------------------------------------------------------------------
		# CASO 4: non ci sono queries che rispettino la distribuzione selezionata - FINITO
		else:
			print(f"PROCESSING INPUT {count}! Required for this bin {num_queries} queries with {distribution} distribution.")
			print(f"This bin does not contain any query with distribution {distribution}")

		print()
		end = time.perf_counter()
		print(f"<System> The execution time for augmentation of input number {count + 1} was {end - start} seconds!")
		print("<System> Processed inputs!")
		print("----------------------------------------------------------------------------------------------------")

	print("<System> Finish augmentation of training set!")


if __name__ == "__main__":
	main()
