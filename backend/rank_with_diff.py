import pandas as pd
import argparse
import os
from collections import defaultdict
import warnings
import shutil
import csv

# Ignore all warnings
warnings.filterwarnings("ignore")

# Esegue una unione tra volori minimi, massimi e intervalli. Restituisce quanto segue:
# INPUT: min_val = 0
#		 max_val = 40
# 		 interval_points = [10, 20, 30]
# OUTPUT: bins = [0, 10, 20, 30, 40]
# 		  labels = ['0.0-10.0', '10.0-20.0', '20.0-30.0', '30.0-40.0']
def create_intervals(min_val, max_val, interval_points):
	bins = [min_val] + interval_points + [max_val]
	labels = [f"{bins[i]:.10f}-{bins[i+1]:.10f}" for i in range(len(bins)-1)]
	return bins, labels

# Funzione che restituisce i valori massimi dei campi 'cardinality', 'executionTime' e 'mbrTests'
def searchMax(fileName):
	searchColumn = ["cardinality", "executionTime", "mbrTests"]					# Colonne da analizzare all'interno del file .csv
	maxValues = {column: None for column in searchColumn}						# Dizionario: nome_parametro --> valore_massimo
	
	with open(fileName, newline='', encoding='utf-8') as csvFile:				# Apertura in sola lettura del file .csv
		dictionary = csv.DictReader(csvFile, delimiter=';')						# Legge ogni riga e la trasoforma in un dizionario con per ogni colonna presa nella prima riga, il valore corrispondente
		
		for row in dictionary:													# Ciclo su ogni riga del dizionario
			for col in searchColumn:											# Per ogni colonna presente in 'searchColumn'...
				value = row.get(col)											# ... salvo il valore corrispondente
				numValue = float(value)											# Conversione del numero in float
				if (maxValues[col] is None) or (numValue > maxValues[col]):		# Se non c'è valore massimo o il valore è più grande del massimo fino ad ora trovato...
					maxValues[col] = numValue									# ... salvo il nuovo massimo

	return maxValues															# Ritorno i valori massimi trovati per ciascun parametro

# Funzione che legge il file contenente gli input e restituisce l'input in parametri
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
		'parameterCategorized',
		'numberIntervals',
		'pathRangeQueriesResult',
		'nameRangeQueriesResult',
		'pathSummaries',
		'nameSummary',
		'pathFD',
		'nameFD'
	]
	
	# Controllo che il file 'filePath' sia corretto e con la giusta intestazione
	if header != expectedHeader:
		raise ValueError(f"<System> The file '{filePath}' is incorrect. Invalid header!")

	# Eliminazione del file 'filePath'
	#os.remove(filePath)
	#print(F"<System> The file '{filePath}' has been successfully deleted!")

	# Restituzione dei parametri di input
	return (
		values[0],			# parameterCategorized = parametro da categorizzare
		int(values[1]),		# numberIntervals = numero di bins da generare
		values[2],			# pathRangeQueriesResult = percorso in cui trovare i risultati delle range queries
		values[3],			# nameRangeQueriesResult = nome del file in cui ci sono i risultati delle range queries
		values[4],			# pathSummaries = percorso in cui trovare i sommari sui datasets
		values[5],			# nameSummary = nome del file in cui ci sono i sommari sui datasets
		values[6],			# pathFD = percorso
		values[7]			# nameFD = nome file
	)


def main():

	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	# LETTURA DEL FILE 'rankParameters.csv' E SALVATAGGIO DEGLI INPUT:
	# Struttura: 'parameterCategorized;numberIntervals;pathRangeQueriesResult;nameRangeQueriesResult;pathSummaries;nameSummary;pathFD;nameFD'
	fileInput = "rankParameters.csv"
	print(f"<System> Starting the reading process for file '{fileInput}'!")
	(
		parameterCategorized,		# parametro da categorizzare
		numberIntervals,			# numero di bins da generare
		pathRangeQueriesResult,		# percorso in cui trovare i risultati delle range queries
		nameRangeQueriesResult,		# nome del file in cui ci sono i risultati delle range queries
		pathSummaries,				# percorso in cui trovare i sommari sui datasets
		nameSummary,				# nome del file in cui ci sono i sommari sui datasets
		pathFD,						# percorso
		nameFD						# nome file
	) = csvReading(fileInput)
	# -------------------------------------------------------------------------------------------------------------------------------------------------------

	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	# LAVORAZIONE SUI PARAMETRI 'cardinality', 'executionTime', 'mbrTests':
	# Valori minimi per parametro (cardinality, executionTime, mbrTests)
	min_values = {
		'cardinality': 0.0, 
		'executionTime': 0, 
		'mbrTests': 0 
	}

	# Verifica che il parametro passato sia uno tra "cardinality", "executionTime" e "mbrTests"
	if parameterCategorized not in min_values:
		raise ValueError(f"<System> Parameter to categorize must be one of {list(min_values.keys())}!")
	print(f"<System> The parameter '{parameterCategorized}' has been accepted!")


	# Valori massimi per parametro (cardinality, executionTime, mbrTests) - da ricavare dal file in "nameRangeQueriesResult"
	print("<System> Finding maximum values for parameters!")
	max_values = searchMax(f"{pathRangeQueriesResult}/{nameRangeQueriesResult}")
	# -------------------------------------------------------------------------------------------------------------------------------------------------------

	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	# GENERAZIONE DEGLI INTERVALLI BIN:
	print("<System> Generation of Bins!")
	min_val = min_values[parameterCategorized]										# imposta i valori minimi in base al parametro scelto
	max_val = max_values[parameterCategorized]										# imposta i valori massimi in base al parametro scelto
	step = (max_val - min_val) / numberIntervals									# calcolo della lunghezza di ogni singolo intervallo
	intervals = [round(min_val + step * i, 8) for i in range(1, numberIntervals)]	# genera gli intervalli
	bins, labels = create_intervals(min_val, max_val, intervals)					# genera bins e labels

	# Metto in 'main_data' le colonne presenti in 'nameRangeQueriesResult' e aggiungo la colonna 'distribution' del file 'nameSummary'
	main_data = pd.read_csv(f"{pathRangeQueriesResult}/{nameRangeQueriesResult}", delimiter=';') 
	summary_data = pd.read_csv(f"{pathSummaries}/{nameSummary}", delimiter=';') 
	main_data = main_data.merge(summary_data[['datasetName', 'distribution']], on='datasetName', how='left')

	# Crea una colonna con la classe del bin
	main_data[f'{parameterCategorized}_class'] = pd.cut(main_data[parameterCategorized], bins=bins, labels=labels, include_lowest=True)

	# Conta quante query ci sono per ogni classe
	print("<System> Counting queries for each Bin!")
	counts = main_data[f'{parameterCategorized}_class'].value_counts().sort_index()

	# Costruisce la tabella riepilogativa
	summary_table = pd.DataFrame({
		'Bin Range': [f"{start:.10f}-{end:.10f}" for start, end in zip(bins[:-1], bins[1:])],
		'Count': [counts.get(label, 0) for label in labels],
		'Bin Index': [f"Bin {i}" for i in range(len(labels))]
	})

	# Ordina per indice del bin (opzionale, ma più chiaro)
	summary_table = summary_table[['Bin Index', 'Bin Range', 'Count']]

	# Stampa la tabella
	print()
	print("Riepilogo Bin:")
	print(summary_table.to_string(index=False))
	print()
	# -------------------------------------------------------------------------------------------------------------------------------------------------------

	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	# COSTRUZIONE DEI PERCORSI DI 'training_set_X' E 'training_set_X_diff':
	# Controllare nella directory corretta tutte le cartelle che iniziano con training_set_, isola il numero seguente e tiene traccia di quello più alto.
	max_index = 0

	# costruisco la cartella contenente gli output
	base = nameRangeQueriesResult.rsplit('.', 1)[0]					# rimuovo estensione "rqR_datasetsDate_UC.csv" --> "rqR_datasetsDate_UC"
	parts = base.split('_')											# divido in base a "_"
	result = '_'.join(parts[1:])									# prendo tutto tranne il primo pezzo : "rqR" "datasetsDate" "UC" --> "datasetsDate_UC"
	pathFolderOutput = f"../trainingSets/{result}"					# "trainingSets/datasetsDate_UC" - impostato una cartella più indietro

	os.makedirs(pathFolderOutput, exist_ok=True)
	for folder_name in os.listdir(pathFolderOutput):
		if folder_name.startswith("training_set_"):
			try:
				index = int(folder_name.split("_")[-1])
				max_index = max(max_index, index)
			except ValueError:
				pass

	# Genera una nuova cartella 'training_set_' con indice 'max_index'+1
	print(f"<System> Generation folder 'training_set_{max_index + 1}!")
	newFolderTs = f"{pathFolderOutput}/training_set_{max_index + 1}"
	os.makedirs(newFolderTs, exist_ok=True)

	# Generazione della cartella che conterrà le differenze
	print(f"<System> Generation folder 'training_set_{max_index + 1}_diff!")
	newFolderDiff = f"{pathFolderOutput}/training_set_{max_index + 1}_diff"
	os.makedirs(newFolderDiff, exist_ok=True)
	# -------------------------------------------------------------------------------------------------------------------------------------------------------

	# -------------------------------------------------------------------------------------------------------------------------------------------------------
	# POPOLAZIONE DELLE CARTELLE 'training_set_X' e 'training_set_X_diff'
	# Ricerca dei datasets analizzati
	datasets = set()
	with open(f"{pathRangeQueriesResult}/{nameRangeQueriesResult}", "r", encoding="utf-8") as rq:
		for i, line in enumerate(rq):					# ciclo su tutte le righe del file
			if i == 0:									# salto la prima riga contenente l'header
				continue
			first_col = line.strip().split(";")[0]		# leggo il nome presente nella prima colonna
			datasets.add(first_col)						# aggiungo il nuovo datasets al set già presente
	
	# 1. Inserimento di 'nameRangeQueriesResult_ts' e 'nameRangeQueriesResult_diff'
	name, ext = os.path.splitext(nameRangeQueriesResult)				# Estrazione del nome del file e la sua estensione
	newNameTs = f"{name}_ts{ext}"										# Creazione del nuovo nome con '_ts'
	newNameDiff = f"{name}_diff{ext}"									# Creazione del nuovo nome con '_diff'
	newPathTs = os.path.join(newFolderTs, newNameTs)					# Percorso del nuovo file nella sottocartella (Ts)
	newPathDiff = os.path.join(newFolderDiff, newNameDiff)				# Percorso del nuovo file nella sottocartella (Diff)
	main_data.drop(columns=['distribution']).to_csv(newPathTs, index=False, sep=';')	# Salvataggio file in '_ts'
	main_data.head(0).to_csv(newPathDiff, index=False, sep=';')							# Salvataggio file in '_diff'
	
	# 2. Inserimento di "nameSummary_ts.csv" e "nameSummary_diff.csv"
	name, ext = os.path.splitext(nameSummary)						# Estrazione del nome del file e la sua estensione
	newNameTs = f"{name}_ts{ext}"									# Creazione del nuovo nome con '_ts'
	newNameDiff = f"{name}_diff{ext}"								# Creazione del nuovo nome con '_diff'
	newPathTs = os.path.join(newFolderTs, newNameTs)				# Percorso del nuovo file nella sottocartella (Ts)
	newPathDiff = os.path.join(newFolderDiff, newNameDiff)			# Percorso del nuovo file nella sottocartella (Diff)
	with open(f"{pathSummaries}/{nameSummary}", "r", encoding="utf-8") as input, \
		 open(newPathTs, "w", encoding="utf-8") as outputTs, \
		 open(newPathDiff, "w", encoding="utf-8") as outputDiff:
		
		for i, line in enumerate(input):
			if i == 0:											# intestazione --> sia in Ts che in Diff
				outputTs.write(line)
				outputDiff.write(line)
			elif line.strip().split(";")[0] in datasets:		# linea dataset --> solo in Ts
				outputTs.write(line)
			else:												# altre linee --> solo in Diff
				outputDiff.write(line)

	# 3. Inserimento di "fd2_geom_allds_ts.csv" e "fd2_geom_allds_diff.csv"
	name, ext = os.path.splitext(nameFD)							# Estrazione del nome del file e la sua estensione
	newNameTs = f"{name}_ts{ext}"									# Creazione del nuovo nome con '_ts'
	newNameDiff = f"{name}_diff{ext}"								# Creazione del nuovo nome con '_diff'
	newPathTs = os.path.join(newFolderTs, newNameTs)				# Percorso del nuovo file nella sottocartella (Ts)
	newPathDiff = os.path.join(newFolderDiff, newNameDiff)			# Percorso del nuovo file nella sottocartella (Diff)
	with open(f"{pathFD}/{nameFD}", "r", encoding="utf-8") as input, \
		 open(newPathTs, "w", encoding="utf-8") as outputTs, \
		 open(newPathDiff, "w", encoding="utf-8") as outputDiff:
		
		for i, line in enumerate(input):
			if i == 0:											# intestazione --> sia in Ts che in Diff
				outputTs.write(line)
				outputDiff.write(line)
			elif line.strip().split(";")[0] in datasets:		# linea dataset --> solo in Ts
				outputTs.write(line)
			else:												# altre linee --> solo in Diff
				outputDiff.write(line)

	# 4. Inserimento di "bin_result_ts.csv"
	binResult = f"bin_{nameRangeQueriesResult.replace('rqR_', '').replace('.csv', '')}"	# file di output dove salvare gli intervalli bin (bin_nameDataset)
	newNameTs = f"{binResult}_ts.csv"													# Creazione del nuovo nome con '_ts'
	newNameDiff = f"{binResult}_diff.csv"												# Creazione del nuovo nome con '_diff'
	newPathTs = os.path.join(newFolderTs, newNameTs)									# Creazione del nuovo nome con '_ts'
	newPathDiff = os.path.join(newFolderDiff, newNameDiff)								# Creazione del nuovo nome con '_diff'
	summary_table.columns = [col.replace(" ", "") for col in summary_table.columns]		# rimozione spazi da "summary_table"
	summary_table["BinIndex"] = summary_table["BinIndex"].str.replace(" ", "")			# rimozione spazi dalla colonna "BinIndex"
	summary_table.to_csv(newPathTs, sep=";", index=False, encoding="utf-8")				# Salvataggio file in '_ts'
	summary_table.head(0).to_csv(newPathDiff, sep=";", index=False, encoding="utf-8")	# Salvataggio file in '_diff'
	# -------------------------------------------------------------------------------------------------------------------------------------------------------

if __name__ == "__main__":
	main()
