import numpy as np
import csv
import math
from scipy import stats
import os
import sys

DIM = 12								# Dimensione degli array x e y (DIM - 1 in realtà)

# -----------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE "csvReading":
def csvReading(filePath):

	"""
	Funzione che legge il file contenente gli input e restituisce l'input in parametri.
	Input:  filePath --> percorso del file contenente i parametri in input.
	Output: pathDatasets --> percorso contenente i datasets del gruppo di datasets scelto;
			pathSummary --> percorso contenente il sommario del gruppo di dataset selezionato;
			nameSummary --> nome del file contenenti le informazioni dei dataset appartenenti al gruppo di dataset selezionato;
			pathRangeQuery_ts --> percorso contenente il file delle range queries del training set selezionato;
			nameRangeQuery_ts --> nome del file contenente le range queries del training set selezionato;
			fromX --> valore che indica il primo dataset da analizzare;
			toX --> valore che indica l'ultimo dataset da analizzare;
			pathFD --> percorso dove salvare il file di output;
			pathFD_ts --> percorso dove salvare il file di output (training set);
			parameters --> parametri su cui calcolare la dimensione frattale.
	"""

	# Controllo che il file 'filePath' esista
	if not os.path.isfile(filePath):
		raise FileNotFoundError(f"<System>      ERROR! The file {filePath} does not exist or is not a valid file!")

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
		raise ValueError(f"<System>      ERROR! The file '{filePath}' is incorrect. Invalid header!")

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
# FUNZIONE "csvSupport":
def csvSupport(filePath):

	"""
	Funzione che legge il file contenente gli elementi necessari per il calcolo della dimensione frattale.
	Input:  filePath --> percorso del file contenente i parametri necessari per il calcolo della dimensione frattale.
	Output: parameter_list --> lista contenente i campi presenti nella colonna "parameter" del file;
			path_summary_list --> lista contenente i campi presenti nella colonna "path_nameSummary" del file;
			dataset_list --> lista contenente i campi presenti nella colonna "datasetName" del file;
			path_fd_list --> lista contenente i campi presenti nella colonna "path_nameFD" del file;
			start_list --> lista contenente i campi presenti nella colonna "start" del file;
			end_list --> lista contenente i campi presenti nella colonna "end" del file;
			dim_list --> lista contenente i campi presenti nella colonna "dim" del file;
			x_list --> lista contenente i primi DIM campi presenti nella colonna "values" del file;
			y_list --> lista contenente i campi presenti nella colonna "" del file.
	"""

	# Controllo che il file 'filePath' esista
	if not os.path.isfile(filePath):
		raise FileNotFoundError(f"<System>      ERROR! The file {filePath} does not exist or is not a valid file!")

	# Intestazione corretta che dovrebbe avere 'filePath'
	expectedHeader = [
		'parameter',
		'path_nameSummary',
		'datasetName',
		'path_nameFD',
		'start',
		'end',
		'dim',
		'values'
	]

	# Liste in cui raccogliere gli output
	parameter_list = []
	path_summary_list = []
	dataset_list = []
	path_fd_list = []
	start_list = []
	end_list = []
	dim_list = []
	values_list = []

	#Lettura del file 'filePath'
	with open(filePath, mode='r', encoding='utf-8') as file:
		reader = csv.reader(file, delimiter=';')		# Lettura del file con separazione dei parametri rispetto al ";"
		header = next(reader)							# Lettura della prima riga (intestazione del file)

		# Controllo che il file abbia la giusta intestazione
		if header[:8] != expectedHeader:
			raise ValueError(f"<System>      ERROR! The file '{filePath}' has invalid header!")

		# Per ogni riga presente nel file
		for row in reader:
			# Controllo sulla corretta formazione della riga
			if len(row) < 7:
				raise ValueError("<System>      ERROR! Row with missing fields!")
			
			# Inserimento dei valori nelle liste corrispettive (ogni inserimento corrisponde a una riga)
			parameter_list.append(row[0])
			path_summary_list.append(row[1])
			dataset_list.append(row[2])
			path_fd_list.append(row[3])
			start_list.append(float(row[4]) if row[4].strip() != '' else None)
			end_list.append(float(row[5]) if row[5].strip() != '' else None)
			dim_list.append(int(row[6]) if row[6].strip() != '' else None)
			raw_values = row[7:]

			# Conversione dei valori
			if len(raw_values) == 0 or raw_values[0].strip() == '':
				values_list.append(None)
			else:
				parsed_values = []
				for v in raw_values:
					v = v.strip()
					if v == '':
						raise ValueError("<System>      ERROR! Empty value inside values list!")
					parsed_values.append(float(v))
				values_list.append(parsed_values)

	# Divisione di values_list in due liste separate (x_least e y_least)
	x_list = []
	y_list = []

	for values, dim in zip(values_list, dim_list):
		if values == None:
			x_list.append(None)
			y_list.append(None)
			continue

		if len(values) != 2 * dim:
			raise ValueError(f"<System>      ERROR! Values length ({len(values)}) incompatible with dim ({dim})!")

		x_list.append(values[:dim])
		y_list.append(values[dim:])

	# Restituzione dei parametri di input
	return (
		parameter_list,
		path_summary_list,
		dataset_list,
		path_fd_list,
		start_list,
		end_list,
		dim_list,
		x_list,
		y_list
	)

# -----------------------------------------------------------------------------------------------------------------------------------
# Funzione "read_summary":
def read_summary(path_nameSummary, fromX, toX):
	
	"""
	Funzione che, passato un file contenente il sommario dei datasets, restituisca i dataset come
	una lista di questo tipo ('datasetName', 'num_features', 'x1', 'y1', 'x2', 'y2').
	Input: path_nameSummary --> percorso completo del file contenente il sommario dei datasets;
		   fromX --> primo dataset da considerare;
		   toX --> ultimo dataset da considerare.
	Output: results --> lista del tipo ('datasetName', 'num_features', 'x1', 'y1', 'x2', 'y2').
	"""

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
# FUNZIONE "fd2D":
def fd2D (from_x, to_x, start_x, end_x, start_y, end_y, file_name, delim):

	"""
	Funzione che calcola la dimensione frattale relativa al dataset passato.
	Input: from_x --> prima geometria da analizzare nel dataset;
		   to_x --> ultima geometria da analizzare nel dataset;
		   start_x, end_x, start_y, end_y --> dimensione finestra del dataset;
		   file_name --> path completo contenente il dataset in questione;
		   delim --> delimitatore all'interno del file '.csv' (',' o ';' solitamente).
	Output: Slope --> dimansione frattale richiesta.
	"""

	deltax = end_x - start_x						# lunghezza x della finestra di dataset
	deltay = end_y - start_y						# lunghezza y della finestra di dataset
	cell_width = deltax / pow(2,DIM)				# dimensione x della cella con cui partizionare lo spazio (deltax / 2^DIM(4096))
	cell_height = deltay / pow(2,DIM)				# dimensione y della cella con cui partizionare lo spazio (deltay / 2^DIM(4096))
	hist = np.zeros((pow(2,DIM),pow(2,DIM)))		# matrice che conterrà celle --> numero geometrie
	print("<System>           deltaX: ", str(deltax), ", deltaY: ", str(deltay), ", cell_width(x): ", str(cell_width), ", cell_height(y): ", str(cell_height))
	
	# Lettura del file contenente le geometrie del dataset
	with open(file_name, mode='r') as csv_file:
		# Leggo ogni riga come fosse un dizionario con campi: xmin, ymin, xmax, ymax (bounding box delle geometrie)
		csv_reader = csv.DictReader(csv_file, fieldnames=['xmin','ymin','xmax','ymax'], delimiter=delim)
		line_count = 0								# Contatore delle righe lette

		for row in csv_reader:						# Per ogni riga del file .csv:
			if (line_count < from_x):				# Se la geometria precede 'from_x', va saltata
				line_count += 1						# Incremento della variabile contatore delle righe analizzate
				continue							# Salto la geometria
			if (line_count == to_x):				# Se la geometria supera 'to_x', va saltata
				break
			xmin = float(row["xmin"])				# Colonna del file "x1"
			ymin = float(row["ymin"])				# Colonna del file "y1"
			xmax = float(row["xmax"])				# Colonna del file "x2"
			ymax = float(row["ymax"])				# Colonna del file "y2"
			x = ((xmax+xmin)/2.0)-start_x			# Coordinata x del centroide correlato alla figura in analisi
			y = ((ymax+ymin)/2.0)-start_y			# Coordinata y del centroide correlato alla figura in analisi
			col = int(x/cell_width)					# Cerco in quale cella ricade la coordinata x del centroide calcolato
			if (col > pow(2,DIM)-1):				# Gestione overflow nel caso in cui il centroide caschi fuori dalla griglia
				col = pow(2,DIM)-1					# In tal caso, viene inserito nell'ultima cella disponibile
			row = int(y/cell_height)				# Cerco in quale cella ricade la coordinata y del centroide calcolato
			if (row > pow(2,DIM)-1):				# Gestione overflow nel caso in cui il centroide caschi fuori dalla griglia
				row = pow(2,DIM)-1					# In tal caso, viene inserito nell'ultima cella disponibile
			hist[row,col] += 1						# Aggiorno il contatore alla cella corrispondente
			line_count += 1							# Incremento la variabile contatore
			if (line_count % 1000000 == 0):			# Stampa il progresso ogni milione di righe analizzate (ogni milione di geometrie)
				print("<System>           Line: ", line_count)

	# Computing box counting for E2
	x = np.zeros((DIM-1))							# Scala logaritmica della dimensione delle celle
	y = np.zeros((DIM-1))							# Misura della frammentazione
	for i in range(DIM-1):							# Analisi su varie dimensioni di box (i=0 celle originali, i=1 celle a coppie, i=2 celle a terzetti...)
		sm = 0.0
		step = pow(2,i)								# Quanto raggruppare le celle
		print("<System>           i: ", i)
		for j in range(0,pow(2,DIM),step):			# Scorrimento verticale della griglia
			if (j % 1000 == 0):
				print ("<System>           j: ", j)
			for k in range(0,pow(2,DIM),step):		# Scorrimento orizzontale della griglia
				h = hist[j:j+step,k:k+step]			# Prendo un gruppo di celle (estrazione di una sottomatrice di celle)
				sm += pow(np.sum(h),2)				# Somma il numero di elementi nel blocco e lo eleva al quadrato
		print("<System>           sm: ", sm)

		# Salvataggio dei valori logaritmici per ogni i analizzata
		x[i] = math.log(cell_width * step,2)		# Log in base 2 della dimensione della box
		y[i] = math.log(sm,2)						# Log in base 2 della misura accumulata

	return x, y

# -----------------------------------------------------------------------------------------------------------------------------------
# FUNZIONE "fd":
def fd (from_x, to_x, start, end, file_name, field_name, delim):

	"""
	Funzione che calcola la dimensione frattale relativa al parametro passato.
	Input: from_x --> prima riga da analizzare (sommario o range queirs);
		   to_x --> ultima riga da analizzare (sommario o range queirs);
		   start, end --> valori minimo e massimo relativi al parametro selezionato;
		   file_name --> path completo contenente il sommario o le range queries in questione;
		   field_name --> parametro scelto su cui calcolare la dimensione frattale;
		   delim --> delimitatore all'interno del file '.csv' (',' o ';' solitamente).
	Output: Slope --> dimansione frattale richiesta.
	"""

	delta = end - start														# Calcolo della lunghezza totale dell’intervallo analizzato
	cell_width = delta / pow(2,DIM)											# Intervallo diviso in 2^DIM celle (4096 celle)
	hist = np.zeros((pow(2,DIM)))											# Istogramma con celle intervallate --> numero valori in ogni intervallo
	print("delta: ", str(delta), "cell_width: ", str(cell_width))
	
	# Lettura del file passato contenente i valori da analizzare
	with open(file_name, mode='r') as csv_file:
		csv_reader = csv.DictReader(csv_file,delimiter=delim)				# Leggo ogni riga come fosse un dizionario
		line_count = 0														# Contatore delle righe lette
		for row in csv_reader:												# Itera su tutte le righe del file
			if (line_count < from_x):										# Se la linea precede 'from_x', va saltata
				line_count += 1												# Incremento della variabile contatore delle righe analizzate
				continue													# Salto la riga
			if (line_count == to_x):										# Se la linea supera 'to_x', va saltata
				break
			value = float(row[field_name]) - start							# Prende il valore letto e sottrae il valore start per normalizzarlo
			idx = int (value / cell_width)									# Si determina in quale cella ricade il valore analizzato
			if idx > pow(2,DIM)-1:											# Gestione overflow nel caso in cui il valore caschi fuori dalla griglia
				idx = pow(2,DIM)-1											# In tal caso, viene inserito nell'ultima cella disponibile
			hist[idx] += 1													# Aggiorno il contatore alla cella corrispondente
			line_count += 1													# Incremento la variabile contatore

	x = np.zeros((DIM-1))													# Scala logaritmica della dimensione delle celle
	y = np.zeros((DIM-1))													# Misura della frammentazione
	for i in range(DIM-1):													# Analisi su varie dimensioni di celle (i=0 celle originali, i=1 celle a coppie, i=2 celle a quartetti...)
		sm = 0.0
		step = pow(2,i)														# Quanto raggruppare le celle
		for j in range(0,pow(2,DIM),step):									# Scorrimento delle celle dell'istogramma
			h = hist[j:j+step]												# Prendo un gruppo di celle (estrazione di una sottomatrice di celle)
			if (step == 1):													# h è una singola cella
				sm += pow(h[0],2)											# Somma il numero di elementi nella singola cella e lo eleva al quadrato
			else:															# h è una sequenza di celle
				sm += pow(np.sum(h),2)										# Somma il numero di elementi nel blocco e lo eleva al quadrato
		
		# Salvataggio dei valori logaritmici per ogni i analizzata
		x[i] = math.log(cell_width * step,2)								# Log in base 2 della dimensione della box
		y[i] = math.log(sm,2)												# Log in base 2 della misura accumulata
	
	return x, y

# -----------------------------------------------------------------------------------------------------------------------------------
# Funzione "fractalDimension_calculation":
def fractalDimension_calculation(start, end, x_list, y_list):

	"""
	Funzione che, passati i valori di x, y, start e end, calcoli la dimensione frattale richiesta.
	Input: start --> valore start da applicare;
		   end --> valore end da applicare;
		   x_list --> lista dei valori x calcolati precedentemente;
		   y_list --> lista dei valori y calcolati precedentemente.
	Output: slope --> dimensione frattale richiesta.
	"""

	# Nuovi array aventi solo il tratto selezionato (da start a end compresi)
	x_new = np.zeros((end-start+1))
	y_new = np.zeros((end-start+1))

	# Selezione dei dati e inserimento nei nuovi array
	for i in range(end-start+1):
		x_new[i] = x_list[start+i]
		y_new[i] = y_list[start+i]

	#Calcolo della retta interpolante (slope = dimensione frattale)
	slope, intercept, r, p, std_err = stats.linregress(x_new, y_new)

	return slope

# -----------------------------------------------------------------------------------------------------------------------------------
# Funzione "update_summary":
def update_summary(path_nameSummary, fractalDimensions):

	"""
	Funzione che, passato un file contenente il sommario dei datasets, e le dimensioni frattali
	calcolate, aggiorni il file sommario (colonna E2).
	Input: path_nameSummary --> percorso completo del file contenente il sommario dei datasets;
		   fractalDimensions --> lista con il calcolo delle dimensioni frattali per dataset.
	"""

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
# Funzione "update_fd":
def update_fd(path_nameFD, fractalDimensions, header):
	
	"""
	Funzione che, passato un file contenente i parametri di dimensioni frattali relativi ad un sommario,
	aggiorni il file con le dimensioni frattali passate
	Input: path_nameFD --> percorso completo del file da modificare;
		   fractalDimensions --> lista con il calcolo delle dimensioni frattali per ogni parametro;
		   header --> header del file.
	"""
	
	fd_dict = dict(fractalDimensions)											# Converto fractalDimensions in un dizionario -> più facile cercare

	if not os.path.isfile(path_nameFD):											# Verifica esistenza del file, NON ESISTE
		row = [fd_dict.get(key, "") for key in header]							# Composizione della riga da inserire ("valore" se calcolato, "" se non calcolato)
		with open(path_nameFD, "w", encoding="utf-8", newline="") as f:			# Creazione del file
			writer = csv.writer(f, delimiter=";")								# Apertura scrittore
			writer.writerow(header)												# Scrittura header
			writer.writerow(row)												# Scrittura riga con i valori calcolati
	else:																		# Verifica esistenza del file, ESISTE
		with open(path_nameFD, "r", encoding="utf-8") as f:						# Lettura del file già esistente
			reader = csv.reader(f, delimiter=";")								# Apertura lettore
			file_header = next(reader)											# Lettura dell'header
			old_row = next(reader)												# Lettura dei valori già presenti di dimensioni frattali
		if file_header != header:												# Verifica della correttezza dell'header presente nel file
			raise ValueError("<System> FD file has unexpected header!")
		
		row_dict = dict(zip(header, old_row))									# Conversione delle righe lette in dizionari
		for key, value in fd_dict.items():										# Aggiornamento dei soli campi presenti in fd_dict
			if key in row_dict:
				row_dict[key] = value
		new_row = [row_dict[key] for key in header]								# Ordino la riga nel modo corretto

		with open(path_nameFD, "w", encoding="utf-8", newline="") as f:			# Scrittura del file aggiornato
			writer = csv.writer(f, delimiter=";")								# Apertura scrittore
			writer.writerow(header)												# Scrittura header
			writer.writerow(new_row)											# Scrittura riga con i valori aggiornati

# -----------------------------------------------------------------------------------------------------------------------------------
# Funzione "searchMinMaxCount":
def searchMinMaxCount(fileName, parameter):
	
	"""
	Funzione che, passato un file correlato al gruppo di datasets in analisi,
	restituisce i valori di minimo e massimo rispetto al parametro scelto.
	Input: fileName --> percorso completo del file contenente le range queries;
		   parameter --> parametro scelto dall'utente.
	Output: minValue --> valore minimo nella colonna 'parameter' del file passato;
			maxValue --> valore massimo nella colonna 'parameter' del file passato;
			rowCount --> numero di righe del file in questione.
	"""
	
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

# -----------------------------------------------------------------------------------------------------------------------------------
# Funzione "updateSupport":
def updateSupport(expectedHeader, fdSupport_file, parameter_update, pathNameSummary_update, datasetName_update, pathNameFD_update, start_update, end_update, dim_update, x_update, y_update):
	
	"""
	Funzione che aggiorna il file "fdSupport.csv" con i campi passati
	Input: expectedHeader --> header atteso nel file;
		   fdSupport_file --> nome del file da aggiornare;
		   parameter_update --> colonna "parametri" da aggiornare;
		   pathNameSummary_update --> colonna "path summaries" da aggiornare;
		   datasetName_update --> colonna "nome dataset" da aggiornare;
		   pathNameFD_update --> colonna "path FD" da aggiornare;
		   start_update --> colonna "start" da aggiornare;
		   end_update --> colonna "end" da aggiornare;
		   dim_update --> colonna "dim" da aggiornare;
		   x_update --> prima parte della colonna "values" da aggiornare;
		   y_update --> seconda parte della colonna "values" da aggiornare.
	"""
	
	print(f"<System>      Updating the '{fdSupport_file}' file with the fields to be passed to the user.")

	n_row = len(parameter_update)		# Conto quante righe devono essere inserite
	print(parameter_update)
	
	# Più righe da inserire (caso in cui ogni riga riporta i valori per ogni dataset - sovrascrivo il file)
	if 'distribution' in parameter_update:
		# Controllo che tutte le liste passate abbiano la stessa lunghezza
		lists = [
			pathNameSummary_update,
			datasetName_update,
			pathNameFD_update,
			start_update,
			end_update,
			dim_update,
			x_update,
			y_update
		]
		if not all(len(lst) == n_row for lst in lists):
			raise ValueError("<System>           ERROR! Input lists must have the same length!")

		# Apertura del file e sovrascrittura di quest'ultimo con i campi che interessano
		with open(fdSupport_file, mode='w', encoding='utf-8', newline='') as file:
			writer = csv.writer(file, delimiter=';')						# Apertura del writer
			writer.writerow(expectedHeader)									# Scrittura dell'header passato
			for i in range(n_row):											# Scrittura delle righe in base alla lunghezza delle liste passate
				# Ricostruzione di 'values' come unione di x[i] + y[i]
				if x_update[i] is None or y_update[i] is None:
					values = ['']
				else:
					values = list(x_update[i]) + list(y_update[i])

				# Preparazione della riga da inserire come lista di campi
				row = [
					'' if parameter_update[i] is None else parameter_update[i],
					'' if pathNameSummary_update[i] is None else pathNameSummary_update[i],
					'' if datasetName_update[i] is None else datasetName_update[i],
					'' if pathNameFD_update[i] is None else pathNameFD_update[i],
					'' if start_update[i] is None else start_update[i],
					'' if end_update[i] is None else end_update[i],
					'' if dim_update[i] is None else dim_update[i]
				] + values

				writer.writerow(row)										# Scrittura dell'i-esima riga

	else:			# Caso in cui il file non va sovrascritto ma solo aggiornato
		# Lettura del file esistente
		with open(fdSupport_file, mode='r', encoding='utf-8') as file:
			reader = list(csv.reader(file, delimiter=';'))
		header = reader[0]													# Lettura dell'header
		rows = reader[1:]													# Lettura delle righe del file (header escluso)
		if header != expectedHeader:										# Verifica sulla corrispondenza dell'header
			raise ValueError("<System>           ERROR! Invalid header in support file.")

		# Ricostruzione vi 'values' come unione di x + y
		if x_update is None or y_update is None:
			values = ['']
		else:
			values = list(x_update) + list(y_update)

		updated = False														# Variabile boolean di supporto (True solo se è stata modificata la riga)
		for i, row in enumerate(rows):
			if row[0] == parameter_update:   # colonna "parameter"
				rows[i] = [
					'' if parameter_update is None else parameter_update,
					'' if pathNameSummary_update is None else pathNameSummary_update,
					'' if datasetName_update is None else datasetName_update,
					'' if pathNameFD_update is None else pathNameFD_update,
					'' if start_update is None else start_update,
					'' if end_update is None else end_update,
					'' if dim_update is None else dim_update
				] + values
				updated = True
				break
		
		if not updated:
			raise ValueError("<System>           ERROR! Parameter not found in file.")

		# Riscrittura file aggiornato
		with open(fdSupport_file, mode='w', encoding='utf-8', newline='') as file:
			writer = csv.writer(file, delimiter=';')
			writer.writerow(header)
			writer.writerows(rows)





def main():

	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	# LETTURA DI FILE 'fdParameters.csv' E 'fdSupport.csv' E SALVATAGGIO DEGLI INPUT AL LORO INTERNO:
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

	# Struttura: 'parameter;path_nameSummary;datasetName;path_nameFD;start;end;dim;values'
	fileSupport = "fdSupport.csv"
	print(f"<System> Starting the reading process for file '{fileSupport}'!")
	(
		parameter_list,					# lista contenente i campi presenti nella colonna "parameter" del file
		path_summary_list,				# lista contenente i campi presenti nella colonna "path_nameSummary" del file
		dataset_list,					# lista contenente i campi presenti nella colonna "datasetName" del file
		path_fd_list,					# lista contenente i campi presenti nella colonna "path_nameFD" del file
		start_list,						# lista contenente i campi presenti nella colonna "start" del file
		end_list,						# lista contenente i campi presenti nella colonna "end" del file
		dim_list,						# lista contenente i campi presenti nella colonna "dim" del file
		x_list,							# lista contenente i primi DIM campi presenti nella colonna "values" del file
		y_list							# lista contenente i campi presenti nella colonna "" del file
	) = csvSupport(fileSupport)

	expectedHeader = [
		'parameter',
		'path_nameSummary',
		'datasetName',
		'path_nameFD',
		'start',
		'end',
		'dim',
		'values'
	]
	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	
	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	# COSA DEVE CALCOLARE LO SCRIPT:
	print()

	# Verifica se sia stato inserito almeno un parametro
	if not parameters:
		print("<System> ERROR! No parameters were entered to analyze...")
		sys.exit(1)

	# se ci sono parametri, procedo ad analizzarli uno ad uno
	for p in parameters:

		# ---------------------------------------------------------------------------------------------------------------------------------------------------
		# Se in 'parameter' troviamo il valore 'distribution' --> dimensione frattale per calcolo di E2
		if p == 'distribution':
			print("<System> CASE DISTRIBUTION")
			print(f"<System> The user requested the calculation of the x and y lists relating to the distribution of the geometries in the dataset group '{nameSummary}'!")
			
			# Verifica che siano stati inseriti tutti i parametri necessari al calcolo richiesto
			if '' in (pathDatasets, pathSummary, nameSummary) or fromX is None or toX is None:
				print("<System>      ERROR! Not all parameters were passed to complete the requested operation...")
				continue
			
			# Costruzione del percorso completo per la lettura del file 'nameSummary'
			path_nameSummary = os.path.join(pathSummary, nameSummary)		# Percorso completo contenente il file 'nameSummary'
			if not os.path.exists(path_nameSummary):						# Verifica esistenza del file
				raise ValueError(f"<System>      ERROR! The file '{nameSummary}' does not exist in '{pathSummary}'...")
			
			# Genero una lista composta da ('datasetName', 'num_features', 'x1', 'y1', 'x2', 'y2') e calcolo per ciascuno la dimensione frattale
			print(f"<System> Analysis of the summary in '{nameSummary}'")
			datasetsToAnalize = read_summary(path_nameSummary, fromX, toX)					# Lista di dataset
			
			# Lista di campi da restituire all'utente
			parameter_update = []
			pathNameSummary_update = []
			datasetName_update = []
			pathNameFD_update = []
			start_update = []
			end_update = []
			dim_update = []
			x_update = []
			y_update = []

			for datasetName, numFeatures, x1, y1, x2, y2 in datasetsToAnalize:		# Ciclo sulla lista
				print()
				print(f"<System> Analysis of the dataset '{datasetName}':")
				path_nameDataset = os.path.join(pathDatasets, datasetName)			# Percorso completo contenente il file 'datasetName'
				if not os.path.exists(path_nameDataset):							# Verifica esistenza del file
					raise ValueError(f"<System>      ERROR! The dataset '{datasetName}' does not exist in '{pathDatasets}'...")
				
				print(f"<System>      Start of the calculation of the x and y values needed to choose the start and end fields for dataset '{datasetName}'.")
				x_dataset, y_dataset = fd2D(0, numFeatures, x1, x2, y1, y2, path_nameDataset, ",")
				
				# Aggiornamento campi della riga da passare all'utente per la scelta di start e end relativi al seguente dataset
				parameter_update.append(p)
				pathNameSummary_update.append(path_nameSummary)
				datasetName_update.append(datasetName)
				pathNameFD_update.append('')
				start_update.append('')
				end_update.append('')
				dim_update.append(DIM-1)
				x_update.append(x_dataset)
				y_update.append(y_dataset)

			updateSupport(expectedHeader, fileSupport, parameter_update, pathNameSummary_update, datasetName_update, pathNameFD_update, start_update, end_update, dim_update, x_update, y_update)

		# ---------------------------------------------------------------------------------------------------------------------------------------------------
		# Se in 'parameter' troviamo uno tra i valori 'avg_area' o 'avg_side_length_0' o 'avg_side_length_1' --> dimensione frattale su quel parametro (no training set)
		elif p in ('avg_area', 'avg_side_length_0', 'avg_side_length_1', 'E2'):
			print("<System> CASE AVG_AREA OR AVG_SIDE_LENGTH_0 OR AVG_SIDE_LENGTH_1 OR E2")
			print(f"<System> The user requested the calculation of the x and y lists on the parameter '{p}' with reference to '{nameSummary}'")
		
			# Verifica che siano stati inseriti tutti i parametri necessari al calcolo richiesto
			if '' in (pathSummary, nameSummary, pathFD):
				print("<System>      ERROR! Not all parameters were passed to complete the requested operation...")
				continue
		
			# Costruzione del percorso completo per la lettura del file 'nameSummary'
			path_nameSummary = os.path.join(pathSummary, nameSummary)		# Percorso completo contenente il file 'nameSummary'
			if not os.path.exists(path_nameSummary):						# Verifica esistenza del file
				raise ValueError(f"<System>      ERROR! The file '{nameSummary}' does not exist in '{pathSummary}'...")
			
			# Costruzione del percorso completo per il salvataggio del file "nameFD"
			nameFD = f"fd_{nameSummary}"						# Nome del file in cui salvare i risultati
			path_nameFD = os.path.join(pathFD, nameFD)			# Percorso completo dove salvare il file "nameFD"
			os.makedirs(pathFD, exist_ok=True)					# Genero il percorso se non esiste già

			# Calcolo di valore massimo e minimo della colonna 'parameter', numero di righe in 'nameRangeQuery_ts'
			print(f"<System>      Calculate the maximum and minimum values of the '{p}' column!")
			minValue, maxValue, rowCount = searchMinMaxCount(path_nameSummary, p)

			print(f"<System>      Start of the calculation of the x and y values needed to choose the start and end fields of the '{p}' column.")
			x, y = fd(0, rowCount, 0, maxValue, path_nameSummary, p, ";")

			updateSupport(expectedHeader, fileSupport, p, '', '', path_nameFD, '', '', DIM-1, x, y)
			
		# ---------------------------------------------------------------------------------------------------------------------------------------------------
		# se in 'parameter' troviamo uno tra i valori 'cardinality' o 'executionTime' o 'mbrTests' --> dimensione frattale su quel parametro (training set)
		elif p in ('cardinality', 'mbrTests', 'totalExecutionTime'):
			print("<System> CASE CARDINALITY OR EXECUTION_TIME OR MBR_TESTS")
			print(f"<System> The user requested to calculate the fractal dimension on the parameter '{p}' with reference to '{nameRangeQuery_ts}'")

			# verifica che siano stati inseriti tutti i parametri necessari al calcolo richiesto
			if '' in (pathRangeQuery_ts, nameRangeQuery_ts, pathFD_ts):
				print("<System>      ERROR! Not all parameters were passed to complete the requested operation...")
				continue

			# Costruzione del percorso completo per la lettura del file 'nameRangeQuery_ts'
			path_nameRangeQueryTs = os.path.join(pathRangeQuery_ts, nameRangeQuery_ts)		# Percorso completo contenente il file 'nameRangeQuery_ts'
			if not os.path.exists(path_nameRangeQueryTs):									# Verifica esistenza del file
				raise ValueError(f"<System>      ERROR! The file '{nameRangeQuery_ts}' does not exist in '{pathRangeQuery_ts}'...")
			
			# Costruzione del percorso completo per il salvataggio del file "nameFD"
			nameFD = f"fd_{nameRangeQuery_ts}"					# Nome del file in cui salvare i risultati
			path_nameFD = os.path.join(pathFD_ts, nameFD)		# Percorso completo dove salvare il file "nameFD"
			os.makedirs(pathFD_ts, exist_ok=True)				# Genero il percorso se non esiste già

			# Calcolo di valore massimo e minimo della colonna 'parameter', numero di righe in 'nameRangeQuery_ts'
			print(f"<System>      Calculate the maximum and minimum values of the '{p}' column!")
			minValue, maxValue, rowCount = searchMinMaxCount(path_nameRangeQueryTs, p)

			print(f"<System>      Start of the calculation of the x and y values needed to choose the start and end fields of the '{p}' column.")
			x, y = fd(0, rowCount, 0, maxValue, path_nameRangeQueryTs, p, ";")

			updateSupport(expectedHeader, fileSupport, p, '', '', path_nameFD, '', '', DIM-1, x, y)
			
		# ---------------------------------------------------------------------------------------------------------------------------------------------------
		# Se in 'parameter' troviamo il valore 'distribution' --> dimensione frattale per calcolo di E2
		elif p == 'fd':
			print("<System> CASE FRACTAL DIMENSION")
			if parameter_list[0] == 'distribution':
				print(f"<System> The user requested the calculation of fractal dimension relating to the distribution of the geometries in the dataset group '{nameSummary}'!")
				fractalDimensions = []													# Lista di [dataset - dimensioni frattali] da salvare
				for i, dataset in enumerate(dataset_list):								# Per ogni dataset preseente nella lista...
					datasetName_noExt, _ = os.path.splitext(dataset)					# Estrazione del nome del dataset senza estensione
					record = (															# Costruisco ('nome dataset', 'dimensione frattale')
						datasetName_noExt,
						fractalDimension_calculation(int(start_list[i]), int(end_list[i]), x_list[i], y_list[i])
					)
					fractalDimensions.append(record)									# Inserimento della tupla nella lista
				update_summary(path_summary_list[0], fractalDimensions)					# Inserimento dei parametri calcolati nel sommario
				print("<System> End of fractal dimension calculation!")
			elif parameter_list[0] in ('avg_area', 'avg_side_length_0', 'avg_side_length_1', 'E2'):
				print(f"<System> The user requested the calculation of the fractal dimension related to the parameters 'avg_area' or 'avg_side_length_0' or 'avg_side_length_1' or 'E2'!")
				fractalDimensions = []													# Lista di [parameter - dimensioni frattali] da salvare
				for i, parameter in enumerate(parameter_list):							# Per ogni parametro presente nella lista...
					record = (															# Costruisco ('parametro', 'dimensione frattale')
						parameter,
						fractalDimension_calculation(int(start_list[i]), int(end_list[i]), x_list[i], y_list[i])
					)
					fractalDimensions.append(record)									# Inserimento della tupla nella lista
				header = ["avg_area", "avg_side_length_0", "avg_side_length_1", "E2"]	# Header del file
				update_fd(path_fd_list[0], fractalDimensions, header)					# Inserimento dei parametri calcolati nel file correlato
			elif parameter_list[0] in ('cardinality', 'mbrTests', 'totalExecutionTime'):
				print(f"<System> The user requested the calculation of the fractal dimension related to the parameters 'cardinality' or 'executionTime' or 'mbrTests'!")
				fractalDimensions = []													# Lista di [parameter - dimensioni frattali] da salvare
				for i, parameter in enumerate(parameter_list):							# Per ogni parametro presente nella lista...
					record = (															# Costruisco ('parametro', 'dimensione frattale')
						parameter,
						fractalDimension_calculation(int(start_list[i]), int(end_list[i]), x_list[i], y_list[i])
					)
					fractalDimensions.append(record)									# Inserimento della tupla nella lista
				header = ["cardinality", "mbrTests", "totalExecutionTime"]				# Header del file
				update_fd(path_fd_list[0], fractalDimensions, header)					# Inserimento dei parametri calcolati nel file correlato
			else:
				print(f"<System> ERROR! The entered parameter '{p}' is invalid...")

		# ---------------------------------------------------------------------------------------------------------------------------------------------------
		# altrimenti il parametro inserito non è valido
		else:
			print(f"<System> ERROR! The entered parameter '{p}' is invalid...")

	print()
	print("<System> End of script!")

if __name__ == "__main__":
	main()
