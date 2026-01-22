import csv
import subprocess
import os

folder_dataset = "datasets"															# MODIFICA con il nome della cartella contenente tutti i dataset
folder_groupDataset = "datasetTestOther2"											# MODIFICA con il nome della cartella contenente i dataset del gruppo in analisi
folder_summaries = "summaries"														# MODIFICA con il nome della cartella contenente i sommari
file_nameSummaries = "sum_datasetTestOther2.csv"									# MODIFICA con il nome del file contenente il sommario in analisi
file_nameLog = "commands.log"														# MODIFICA con il nome del file di log su cui salvare i comandi generati da mandare a "generator.py"
file_nameGenerator = "Generator.py"													# MODIFICA con il nome del file ustao per generare i dataset

# Creazione del percorso contenente i dataset generati
path_groupDataset = os.path.join(folder_dataset, folder_groupDataset)
os.makedirs(path_groupDataset, exist_ok=True)										# se la cartella esiste già, non genera errori

# Creazione del percorso contenente il sommario in analisi
path_nameSummaries = os.path.join(folder_summaries, file_nameSummaries)

# Creazione del percorso contenente il file log con i comandi mandati per eseguire la generazione del dataset
path_nameLog = os.path.join(folder_dataset, folder_groupDataset, file_nameLog)

def execute_generator(distribution, geometry, cardinality, polysize, output_file, maxseg, width, height, affinematrix):

	# Se 'geometry' == 'polygon' --> 'wkt', altrimenti 'csv'
	fmt = "wkt" if geometry == "polygon" else "csv"

	# Costruzione del comando da mandare a 'file_nameGenerator'
	base = f"python -W ignore {file_nameGenerator} distribution={distribution} " \
		f"cardinality={cardinality} dimensions=2 geometry={geometry} " \
		f"polysize={polysize} maxseg={maxseg} format={fmt} " \
		f"affinematrix={affinematrix} maxsize={width},{height}"

	if distribution == "diagonal":
		base += " percentage=0.5 buffer=0.5"
	elif distribution == "bit":
		base += " probability=0.2 digits=10"
	elif distribution == "parcel":
		base += " srange=0.5 dither=0.5"

	command = base

	# Invio del comando per la generazione del dataset
	with open(output_file, "w") as f_out:
		subprocess.run(command.split(), stdout=f_out)

	# Salvataggio del comando nel file log
	with open(path_nameLog, "a") as log:
		log.write(command + "\n")


print("<System> Generating datasets.\n")

with open(path_nameSummaries, newline="") as f:
	reader = csv.reader(f, delimiter=";")											# Lettura del file con il sommario dei dataset
	next(reader)																	# Salta l'header di intestazione

	for row in reader:																# Per ogni riga del file in questione...
		(datasetName, distribution, geometry, x1, y1, x2, y2,						# nome del dataset, distribuzione, tipo di geometrie, dimensione finestra (x1, y1, x2, y2),
		 num_features, max_seg, num_points, avg_area,								# numero geometrie, numero lati massimo, numero punti, media area,
		 avg_side_length_0, avg_side_length_1, E0, E2) = row						# media lato x, media lato y, E0, E1

		print(f"\n<System> Processing: {datasetName}")
		print(f"<System> Distribution: {distribution}")
		print(f"<System> Geometry: {geometry}")
		print(f"<System> Cardinality: {num_features}\n")

		if geometry == "polygon":													# Se le geometrie generate sono poligoni...
			output_file = os.path.join(path_groupDataset, f"{datasetName}.wkt")		# ... il dataset generato viene salvato in un file con estensione ".wkt"
		else:																		# Se le geometrie generate sono punti o box...
			output_file = os.path.join(path_groupDataset, f"{datasetName}.csv")		# ... il dataset generato viene salvato in un file con estensione ".csv"

		# Composizione della matrice di affinamento
		x1, x2 = float(x1), float(x2)
		y1, y2 = float(y1), float(y2)
		a1 = round((x2 - x1), 6)
		a3 = x1
		a5 = round((y2 - y1), 6)
		a6 = y1
		matrix = f"{a1},0,{a3},0,{a5},{a6}"

		execute_generator(
			distribution=distribution,
			geometry=geometry,
			cardinality=num_features,
			polysize=avg_area,
			output_file=output_file,
			maxseg=max_seg,
			width=avg_side_length_0,
			height=avg_side_length_1,
			affinematrix=matrix
		)

print("<System> Generation complete.")
