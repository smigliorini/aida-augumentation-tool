import numpy as np
import csv
import math
from scipy import stats
import os
import sys

DIM = 12

# -----------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE "fd2D":
# Funzione che calcola la dimensione frattale relativa al dataset passato.
# Input:  from_x --> prima geometria da analizzare nel dataset;
# 		  to_x --> ultima geometria da analizzare nel dataset;
# 		  start_x, end_x, start_y, end_y --> dimensione finestra del dataset;
# 		  file_name --> path completo contenente il dataset in questione;
# 		  delim --> delimitatore all'interno del file '.csv' (',' o ';' solitamente).
# Output: Slope --> dimansione frattale richiesta.
def fd2D (from_x, to_x, start_x, end_x, start_y, end_y, file_name, delim):
	deltax = end_x - start_x						# lunghezza x della finestra di dataset
	deltay = end_y - start_y						# lunghezza y della finestra di dataset
	cell_width = deltax / pow(2,DIM)				# dimensione x della cella con cui partizionare lo spazio (deltax / 4096)
	cell_height = deltay / pow(2,DIM)				# dimensione y della cella con cui partizionare lo spazio (deltay / 4096)
	hist = np.zeros((pow(2,DIM),pow(2,DIM)))		# matrice che conterrà celle --> numero geometrie
	print("dataset: ", file_name)
	print("deltax,y: ", str(deltax), str(deltay), "cell_width: ", str(cell_width), "cell_height: ", str(cell_height))
	with open(file_name, mode='r') as csv_file:
		csv_reader = csv.DictReader(csv_file, fieldnames=['xmin','ymin','xmax','ymax'], delimiter=delim)
		line_count = 0
		for row in csv_reader:
			if (line_count < from_x):				# skip geometrie precedenti a 'from_x'
				line_count += 1
				continue
			if (line_count == to_x):				# fine geometrie successive 'to_x'
				break
			xmin = float(row["xmin"])				# x1
			ymin = float(row["ymin"])				# y1
			xmax = float(row["xmax"])				# x2
			ymax = float(row["ymax"])				# y2
			x = ((xmax+xmin)/2.0)-start_x			# coordinata x centroide
			y = ((ymax+ymin)/2.0)-start_y			# coordinata y centroide
			col = int(x/cell_width)					# in quale cella rientra la coordinata x
			if (col > pow(2,DIM)-1):
				col = pow(2,DIM)-1
			row = int(y/cell_height)				# in quale cella rientra la coordinata y
			if (row > pow(2,DIM)-1):
				row = pow(2,DIM)-1
			hist[row,col] += 1						# aggiorno il contatore alla cella corrispondente
			line_count += 1
			if (line_count % 1000000 == 0):
				print("Line: ", line_count)
	# computing box counting for E2
	x = np.zeros((DIM-1))
	y = np.zeros((DIM-1))
	for i in range(DIM-1):
		sm = 0.0
		step = pow(2,i)
		print("i: ", i)
		for j in range(0,pow(2,DIM),step):
			if (j % 1000 == 0):
				print ("j: ", j)
			for k in range(0,pow(2,DIM),step):
				h = hist[j:j+step,k:k+step]
				# h è una sottomatrice di celle
				sm += pow(np.sum(h),2)
		print("sm: ", sm)
		x[i] = math.log(cell_width * step,2)
		y[i] = math.log(sm,2)

	# selection the portion of curve to interpolate
	start = -1
	end = -1
	for k in range(DIM-2):
		if (start == -1 and abs(y[k+1] - y[k]) >= 0.5):
			start = k
	for k in range(DIM-2,0,-1):
		if (end == -1 and abs(y[k] - y[k-1]) >= 0.5):
			end = k

	#print("start: ", start, " end: ", end)

	x_new = np.zeros((end-start+1))
	y_new = np.zeros((end-start+1))
	for i in range(end-start+1):
		x_new[i] = x[start+i]
		y_new[i] = y[start+i]

	slope, intercept, r, p, std_err = stats.linregress(x_new, y_new)
	return slope

# -----------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE "fd":
# Funzione che calcola la dimensione frattale relativa al parametro passato.
# Input:  from_x --> prima riga da analizzare (sommario o range queirs);
# 		  to_x --> ultima riga da analizzare (sommario o range queirs);
# 		  start, end --> valori minimo e massimo relativi al parametro selezionato;
# 		  file_name --> path completo contenente il sommario o le range queries in questione;
# 		  field_name --> parametro scelto su cui calcolare la dimensione frattale;
# 		  delim --> delimitatore all'interno del file '.csv' (',' o ';' solitamente).
# Output: Slope --> dimansione frattale richiesta.
def fd (from_x, to_x, start, end, file_name, field_name, delim):
	delta = end - start
	cell_width = delta / pow(2,DIM)
	hist = np.zeros((pow(2,DIM)))
	print("delta: ", str(delta), "cell_width: ", str(cell_width))
	# Reading file
	with open(file_name, mode='r') as csv_file:
		csv_reader = csv.DictReader(csv_file,delimiter=delim)
		line_count = 0
		for row in csv_reader:
			if (line_count == 0):
				print(f'Column names are: {", ".join(row)}')
				print()
			if (line_count < from_x):
				line_count += 1
				continue
			if (line_count == to_x):
				break
			value = float(row[field_name]) - start
			idx = int (value / cell_width)
			if idx > 4095:
				idx = 4095
			hist[idx] += 1
			line_count += 1

	# computing box counting for E2
	x = np.zeros((DIM-1))
	y = np.zeros((DIM-1))
	for i in range(DIM-1):
		sm = 0.0
		step = pow(2,i)
		for j in range(0,pow(2,DIM),step):
			h = hist[j:j+step]
			if (step == 1): # h è una singola cella
				sm += pow(h[0],2)
			else: # h è una sequenza di celle
				sm += pow(np.sum(h),2)
		x[i] = math.log(cell_width * step,2)
		y[i] = math.log(sm,2)

	slope, intercept, r, p, std_err = stats.linregress(x, y)

	return slope	

"""
def apply_fd(summary_file, ds_path, file_out, from_x, to_x, start_x, end_x, start_y, end_y, field_name, dim, delim1, delim2):
# from_x, to_x: seleziona un sottoinsieme di datasets da generare: se ho un file di 10 righe per leggerle tutte mettere 1,10
# Reading file
	fd_out = []
	fieldnames = ['datasetName', 'fd']
	with open(summary_file, mode='r') as csv_file, open(file_out, 'w', encoding='UTF8', newline='') as f:
		csv_reader = csv.DictReader(csv_file, delimiter = delim1)
		writer = csv.DictWriter(f, fieldnames = fieldnames, delimiter = ';')
		writer.writeheader()
		line_count = 1
		for row in csv_reader:
			if (line_count == 1):
				print(f'<System> Column names are: {", ".join(row)}')
			if (line_count < from_x):
				line_count += 1
				continue
			if (line_count == to_x+1):
				break
			print(f"<System> Processing line {line_count}...")
			ds = f"{row['datasetName']}.csv"
			file_ds = os.path.join(ds_path, ds)
			if (dim == 1):
				fd, x, y, cell_w, cell_h = fd(0, int(row["num_features"]), start_x, end_x, file_ds, field_name, delim2)
			else:
				fd, x, y, cell_w, cell_h = fd2D(0, int(row["num_features"]), start_x, end_x, start_y, end_y, file_ds, delim2)
			
			fd_out.append({'datasetName': ds, 'fd': fd})
			print(f"<System> fd[{line_count}] => {fd}")
			writer.writerow(fd_out[line_count - 1])
			line_count += 1
"""




# -----------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE "csvReading":
# Funzione che legge il file contenente gli input e restituisce l'input in parametri.
# Input:  filePath --> percorso del file contenente i parametri in input.
# Output: pathDatasets --> percorso contenente i datasets del gruppo di datasets scelto
# 		  pathSummary --> percorso contenente il sommario del gruppo di dataset selezionato
#		  nameSummary --> nome del file contenenti le informazioni dei dataset appartenenti al gruppo di dataset selezionato
#		  pathRangeQuery_ts --> percorso contenente il file delle range queries del training set selezionato
#		  nameRangeQuery_ts --> nome del file contenente le range queries del training set selezionato
#		  fromX --> valore che indica il primo dataset da analizzare
#		  toX --> valore che indica l'ultimo dataset da analizzare
#		  pathFD --> percorso dove salvare il file di output
# 		  pathFD_ts --> percorso dove salvare il file di output (training set)
# 		  parameters --> parametri su cui calcolare la dimensione frattale
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
		'pathDatasets',
		'pathSummary',
		'nameSummary',
		'pathRangeQuery_ts',
		'nameRangeQuery_ts',
		'fromX',
		'toX',
		'pathFD',
		'pathFD_ts',
		'parameters'
	]
	
	# Controllo che il file 'filePath' sia corretto e con la giusta intestazione
	if header != expectedHeader:
		raise ValueError(f"<System> The file '{filePath}' is incorrect. Invalid header!")

	# Eliminazione del file 'filePath'
	#os.remove(filePath)
	#print(F"<System> The file '{filePath}' has been successfully deleted!")

	# Conversione sicura di fromX e toX
	fromX = int(values[5]) if values[5].strip() != '' else None
	toX   = int(values[6]) if values[6].strip() != '' else None

	# Restituzione dei parametri di input
	return (
		values[0],			# pathDatasets = percorso contenente i datasets del gruppo di datasets scelto
		values[1],			# pathSummary = percorso contenente il sommario del gruppo di dataset selezionato
		values[2],			# nameSummary = nome del file contenenti le informazioni dei dataset appartenenti al gruppo di dataset selezionato
		values[3],			# pathRangeQuery_ts = percorso contenente il file delle range queries del training set selezionato
		values[4],			# nameRangeQuery_ts = nome del file contenente le range queries del training set selezionato
		fromX,				# fromX = valore che indica il primo dataset da analizzare
		toX,				# toX = valore che indica l'ultimo dataset da analizzare
		values[7],			# pathFD = percorso dove salvare il file di output
		values[8],			# pathFD_ts = percorso dove salvare il file di output (training set)
		values[9:]			# parameters = parametri su cui calcolare la dimensione frattale
	)

# -----------------------------------------------------------------------------------------------------------------------------------
# Funzione "read_summary":
# Funzione che, passato un file contenente il sommario dei datasets, restituisca i dataset come
# una lista di questo tipo ('datasetName', 'num_features', 'x1', 'y1', 'x2', 'y2').
# Input: path_nameSummary --> percorso completo del file contenente il sommario dei datasets;
# 		 fromX --> primo dataset da considerare;
# 		 toX --> ultimo dataset da considerare.
# Output: results --> lista del tipo ('datasetName', 'num_features', 'x1', 'y1', 'x2', 'y2').
def read_summary(path_nameSummary, fromX, toX):
	results = []														# Lista che conterrà i dati selezionati

	with open(path_nameSummary, mode="r", encoding="utf-8") as file:	# Apertura del file in lettura
		reader = csv.DictReader(file, delimiter=";")					# Accesso alle colonne per nome

		for idx, row in enumerate(reader, start=1):						# Scorre ogni riga, automaticamente salta l’header	
			# Se non ho ancora raggiunto il primo dataset da analizzare, vado al prossimo
			if idx < fromX:
				continue
				
			# Se ho raggiunto l'ultimo dataset da analizzare, fermo il ciclo
			if idx > toX:
				break
			
			# Costruisco per ogni riga la tupla da inserire nella lista
			result = (
				f"{row['datasetName']}.csv",
				int(row['num_features']),
				float(row["x1"]),
				float(row["y1"]),
				float(row["x2"]),
				float(row["y2"])
			)
			results.append(result)										# Inserimento della tupla nella lista

	return results														# Ritorno la lista

# -----------------------------------------------------------------------------------------------------------------------------------
# Funzione "update_summary":
# Funzione che, passato un file contenente il sommario dei datasets, e le dimensioni frattali
# calcolate, aggiorni il file sommario (colonna E2)
# Input: path_nameSummary --> percorso completo del file contenente il sommario dei datasets;
# 		 fractalDimensions --> lista con il calcolo delle dimensioni frattali per dataset.
def update_summary(path_nameSummary, fractalDimensions):

	fd_dict = dict(fractalDimensions)											# Converto fractalDimensions in un dizionario -> più facile cercare

	rows = []
	with open(path_nameSummary, mode="r", encoding="utf-8") as infile:			# Apertura del file in scrittura
		reader = csv.DictReader(infile, delimiter=";")							# Lettura del file
		fieldnames = reader.fieldnames											# Nomi delle colonne

		for row in reader:														# Ciclo su tutte le righe del file
			datasetName = row["datasetName"]									# Leggo il nome del dataset
			if datasetName in fd_dict:											# Se è stata calcolata la dimensione frattale ...
				row["E2"] = fd_dict[datasetName]								# ... la aggiorno
			rows.append(row)

	# Sovrascrivo il file con la colonna E2 aggiornata
	with open(path_nameSummary, mode="w", encoding="utf-8", newline="") as outfile:
		writer = csv.DictWriter(outfile, fieldnames=fieldnames, delimiter=";")
		writer.writeheader()
		writer.writerows(rows)

# -----------------------------------------------------------------------------------------------------------------------------------
# Funzione "searchMinMaxCount":
# Funzione che, passato un file correlato al gruppo di datasets in analisi,
# restituisce i valori di minimo e massimo rispetto al parametro scelto.
# Input: fileName --> percorso completo del file contenente le range queries;
# 		 parameter --> parametro scelto dall'utente.
# Output: minValue --> valore minimo nella colonna 'parameter' del file passato;
# 		  maxValue --> valore massimo nella colonna 'parameter' del file passato;
# 		  rowCount --> numero di righe del file in questione.
def searchMinMaxCount(fileName, parameter):
	# Apertura del file in questione
	with open(fileName, newline='', encoding='utf-8') as csvFile:
		dictionary = csv.DictReader(csvFile, delimiter=';')		# Trasformo le righe in dizionario (per semplicità di calcolo)

		if parameter not in dictionary.fieldnames:				# Verifico che esista una colonna che si chiami 'parameter'
			raise ValueError(f"<System> ERROR! Column '{parameter}' not found in file '{fileName}'...")

		minValue, maxValue = None, None							# Valore minimo e valore massimo
		rowCount = 0											# Contatore di righe

		for row in dictionary:									# Scorro le varie righe del file e analizzo il valore della colonna 'parameter'
			value = row.get(parameter)							# Prendo il valore
			rowCount += 1										# Incremento contatore righe

			if value is None or value.strip() == "":			# Gestione eventuali valori vuoti
				continue										# Passo al prossimo

			numValue = float(value)								# Lo trasformo in float

			if (minValue is None) or (numValue < minValue):		# Salvo in caso sia il minimo momentaneo
				minValue = numValue
			if (maxValue is None) or (numValue > maxValue):		# Salvo in caso sia il massimo momentaneo
				maxValue = numValue

	return minValue, maxValue, rowCount							# Ritorno valore minimo e massimo






def main():

	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	# LETTURA DEL FILE 'fdParameters.csv' E SALVATAGGIO DEGLI INPUT:
	# Struttura: 'pathDatasets;pathSummary;nameSummary;pathRangeQuery_ts;nameRangeQuery_ts;fromX;toX;pathFD;parameters'
	fileInput = "fdParameters.csv"
	print(f"<System> Starting the reading process for file '{fileInput}'!")
	(
		pathDatasets,					# percorso contenente i datasets del gruppo di datasets scelto
		pathSummary,					# percorso contenente il sommario del gruppo di dataset selezionato
		nameSummary,					# nome del file contenenti le informazioni dei dataset appartenenti al gruppo di dataset selezionato
		pathRangeQuery_ts,				# percorso contenente il file delle range queries del training set selezionato
		nameRangeQuery_ts,				# nome del file contenente le range queries del training set selezionato
		fromX,							# valore che indica il primo dataset da analizzare
		toX,							# valore che indica l'ultimo dataset da analizzare
		pathFD,							# percorso dove salvare il file di output
		pathFD_ts,						# percorso dove salvare il file di output (training set)
		parameters						# parametri su cui calcolare la dimensione frattale
	) = csvReading(fileInput)
	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	
	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	# COSA DEVE CALCOLARE LO SCRIPT:
	print()

	# verifica se sia stato inserito almeno un parametro
	if not parameters:
		print("<System> ERROR! No parameters were entered to analyze...")
		sys.exit(1)

	# se ci sono parametri, procedo ad analizzarli uno ad uno
	for p in parameters:

		# ---------------------------------------------------------------------------------------------------------------------------------------------------
		# Se in 'parameter' troviamo il valore 'distribution' --> dimensione frattale per calcolo di E2
		if p == 'distribution':
			print(f"<System> The user requested to calculate E2 on the group of datasets in '{pathDatasets}' directory")

			# Verifica che siano stati inseriti tutti i parametri necessari al calcolo richiesto
			if '' in (pathDatasets, pathSummary, nameSummary) or fromX is None or toX is None:
				print("<System> ERROR! Not all parameters were passed to complete the requested operation...")
				continue
			
			# Costruzione del percorso completo per la lettura del file 'nameSummary'
			path_nameSummary = os.path.join(pathSummary, nameSummary)		# Percorso completo contenente il file 'nameSummary'
			if not os.path.exists(path_nameSummary):						# Verifica esistenza del file
				raise ValueError(f"<System> ERROR! The file '{nameSummary}' does not exist in '{pathSummary}'...")
			
			print("<System> Start of fractal dimension calculation")

			# Genero una lista composta da ('datasetName', 'num_features', 'x1', 'y1', 'x2', 'y2') e calcolo per ciascuno la dimensione frattale
			datasetsToAnalize = read_summary(path_nameSummary, fromX, toX)					# Lista di dataset
			fractalDimensions = []

			for datasetName, numFeatures, x1, y1, x2, y2 in datasetsToAnalize:		# Ciclo sulla lista
				path_nameDataset = os.path.join(pathDatasets, datasetName)			# Percorso completo contenente il file 'datasetName'
				if not os.path.exists(path_nameDataset):							# Verifica esistenza del file
					raise ValueError(f"<System> ERROR! The dataset '{datasetName}' does not exist in '{pathDatasets}'...")
				
				E2 = fd2D(0, numFeatures, x1, x2, y1, y2, path_nameDataset, ",")
				datasetName_noExt, _ = os.path.splitext(datasetName)				# Nome del dataset senza estensione
				record = (															# Costruisco ('nome dataset', 'E2')
					datasetName_noExt,
					E2
				)
				fractalDimensions.append(record)									# Inserimento della tupla nella lista

			# Inserimento dei parametri calcolati nel file
			update_summary(path_nameSummary, fractalDimensions)
		
		# ---------------------------------------------------------------------------------------------------------------------------------------------------
		# Se in 'parameter' troviamo uno tra i valori 'avg_area' o 'avg_side_length_0' o 'avg_side_length_1' --> dimensione frattale su quel parametro (no training set)
		elif p in ('avg_area', 'avg_side_length_0', 'avg_side_length_1'):
			print(f"<System> The user requested to calculate the fractal dimension on the parameter '{p}' with reference to '{nameSummary}'")
		
			# Verifica che siano stati inseriti tutti i parametri necessari al calcolo richiesto
			if '' in (pathSummary, nameSummary, pathFD):
				print("<System> ERROR! Not all parameters were passed to complete the requested operation...")
				continue
		
			# Costruzione del percorso completo per la lettura del file 'nameSummary'
			path_nameSummary = os.path.join(pathSummary, nameSummary)		# Percorso completo contenente il file 'nameSummary'
			if not os.path.exists(path_nameSummary):						# Verifica esistenza del file
				raise ValueError(f"<System> ERROR! The file '{nameSummary}' does not exist in '{pathSummary}'...")
			
			# Costruzione del percorso completo per il salvataggio del file "nameFD"
			nameFD = f"fd_{nameSummary}"						# Nome del file in cui salvare i risultati
			path_nameFD = os.path.join(pathFD, nameFD)			# Percorso completo dove salvare il file "nameFD"
			os.makedirs(pathFD, exist_ok=True)					# Genero il percorso se non esiste già

			print("<System> Start of fractal dimension calculation")

			# Calcolo di valore massimo e minimo della colonna 'parameter', numero di righe in 'nameRangeQuery_ts'
			minValue, maxValue, rowCount = searchMinMaxCount(path_nameSummary, p)

			fdResult = fd(0, rowCount, 0, maxValue, path_nameSummary, p, ";")

			print()
			print(fdResult)
			print()

			# Processo di salvataggio dei risultati nel folder indicato
			header = ["avg_area", "avg_side_length_0", "avg_side_length_1"]		# Header del file

			if not os.path.isfile(path_nameFD):									# Verifica esistenza del file, NON ESISTE
				# Composizione della riga da inserire
				row = ["", "", ""]
				if p == 'avg_area':												# Parametro analizzato: 'avg_area'
					row[0] = fdResult
				elif p == 'avg_side_length_0':									# Parametro analizzato: 'avg_side_length_0'
					row[1] = fdResult
				else:															# Parametro analizzato: 'avg_side_length_1'
					row[2] = fdResult

				with open(path_nameFD, "w", encoding="utf-8", newline="") as f:	# Creazione del file
					writer = csv.writer(f, delimiter=";")
					writer.writerow(header)
					writer.writerow(row)
			else:																# Verifica esistenza del file, ESISTE
				with open(path_nameFD, "r", encoding="utf-8") as f:				# Apertura del file
					reader = csv.reader(f, delimiter=";")						# Lettura del file
					rows = list(reader)											# Generazione lista con due tuple (header + values)

					if p in rows[0]:											# Se il parametro è nell'header del file allora procedo
						values = rows[1]										# Valori esistenti
						idx = header.index(p)									# Indice del parametro in analisi
						values[idx] = fdResult									# Inserimento del valore nella colonna corretta

						with open(path_nameFD, "w", encoding="utf-8", newline="") as f:		# Riscrittura del file con i parametri
							writer = csv.writer(f, delimiter=";")							# Scrittura del file
							writer.writerow(header)											# Scrittura header
							writer.writerow(values)											# Scrittura dei valori

					else:														# Se il parametro non è nell'header, mando un messaggio
						print(f"<System> The entered parameter '{p}' is not among the parameters on which to calculate the fractal dimension!")
						continue
			
		# ---------------------------------------------------------------------------------------------------------------------------------------------------
		# se in 'parameter' troviamo uno tra i valori 'cardinality' o 'executionTime' o 'mbrTests' --> dimensione frattale su quel parametro (training set)
		elif p in ('cardinality', 'executionTime', 'mbrTests'):
			print(f"<System> The user requested to calculate the fractal dimension on the parameter '{p}' with reference to '{nameRangeQuery_ts}'")

			# verifica che siano stati inseriti tutti i parametri necessari al calcolo richiesto
			if '' in (pathRangeQuery_ts, nameRangeQuery_ts, pathFD_ts):
				print("<System> ERROR! Not all parameters were passed to complete the requested operation...")
				continue

			# Costruzione del percorso completo per la lettura del file 'nameRangeQuery_ts'
			path_nameRangeQueryTs = os.path.join(pathRangeQuery_ts, nameRangeQuery_ts)		# Percorso completo contenente il file 'nameRangeQuery_ts'
			if not os.path.exists(path_nameRangeQueryTs):									# Verifica esistenza del file
				raise ValueError(f"<System> ERROR! The file '{nameRangeQuery_ts}' does not exist in '{pathRangeQuery_ts}'...")
			
			# Costruzione del percorso completo per il salvataggio del file "nameFD"
			nameFD = f"fd_{nameRangeQuery_ts}"					# Nome del file in cui salvare i risultati
			path_nameFD = os.path.join(pathFD_ts, nameFD)		# Percorso completo dove salvare il file "nameFD"
			os.makedirs(pathFD_ts, exist_ok=True)				# Genero il percorso se non esiste già

			print("<System> Start of fractal dimension calculation")

			# Calcolo di valore massimo e minimo della colonna 'parameter', numero di righe in 'nameRangeQuery_ts'
			minValue, maxValue, rowCount = searchMinMaxCount(path_nameRangeQueryTs, p)

			fdResult = fd(0, rowCount, 0, maxValue, path_nameRangeQueryTs, p, ";")
			
			# Processo di salvataggio dei risultati nel folder indicato
			header = ["cardinality", "executionTime", "mbrTests"]				# Header del file

			if not os.path.isfile(path_nameFD):									# Verifica esistenza del file, NON ESISTE
				# Composizione della riga da inserire
				row = ["", "", ""]
				if p == 'cardinality':											# Parametro analizzato: 'avg_area'
					row[0] = fdResult
				elif p == 'executionTime':										# Parametro analizzato: 'avg_side_length_0'
					row[1] = fdResult
				else:															# Parametro analizzato: 'avg_side_length_1'
					row[2] = fdResult

				with open(path_nameFD, "w", encoding="utf-8", newline="") as f:	# Creazione del file
					writer = csv.writer(f, delimiter=";")
					writer.writerow(header)
					writer.writerow(row)
			else:																# Verifica esistenza del file, ESISTE
				with open(path_nameFD, "r", encoding="utf-8") as f:				# Apertura del file
					reader = csv.reader(f, delimiter=";")						# Lettura del file
					rows = list(reader)											# Generazione lista con due tuple (header + values)

					if p in rows[0]:											# Se il parametro è nell'header del file allora procedo
						values = rows[1]										# Valori esistenti
						idx = header.index(p)									# Indice del parametro in analisi
						values[idx] = fdResult									# Inserimento del valore nella colonna corretta

						with open(path_nameFD, "w", encoding="utf-8", newline="") as f:		# Riscrittura del file con i parametri
							writer = csv.writer(f, delimiter=";")							# Scrittura del file
							writer.writerow(header)											# Scrittura header
							writer.writerow(values)											# Scrittura dei valori

					else:														# Se il parametro non è nell'header, mando un messaggio
						print(f"<System> The entered parameter '{p}' is not among the parameters on which to calculate the fractal dimension!")
						continue

		# altrimenti il parametro inserito non è valido
		else:
			print(f"<System> ERROR! The entered parameter '{p}' is invalid...")

	print()
	print("<System> End of fractal dimension calculation!")

if __name__ == "__main__":
	main()
