import edu.ucr.cs.bdlab.beast._
import edu.ucr.cs.bdlab.beast.geolite.{EnvelopeNDLite, IFeature}
import org.apache.spark.{SparkConf, SparkContext}
import org.apache.spark.rdd.RDD
import org.apache.spark.util.LongAccumulator
import org.locationtech.jts.geom.{Coordinate, GeometryFactory, Polygon}
import java.io.{File, FileWriter, FileNotFoundException, PrintWriter}
import scala.io.Source
import edu.ucr.cs.bdlab.beast.indexing.RSGrovePartitioner

object IndexApp {
	
	/* FUNZIONE 'main' */
	/* Funzione che implementa lo scheletro principale per partizionare i dataset.
	 * 1. Creazione della configurazione e del contesto Spark;
	 * 2. Inizializzazione dei percorsi contenente dataset e indici spaziali;
	 * 3. Ricerca e stampa dei dataset da partizionare;
	 * 4. Processo di partizione dei dataset e di salvataggio dei rispettivi indici spaziali;
	 * 5. Chiusura del contesto Spark.
	 */
	def main(args: Array[String]): Unit = {
		/* 1. CREAZIONE DELLA CONFIGURAZIONE E DEL CONTESTO SPARK */
		val conf = new SparkConf().setAppName("Beast Example").setMaster("local[*]")    // Creazione della configurazione Spark (SparkConf)
		val sc = new SparkContext(conf)                                                 // Creazione del contesto Spark (SparkContext)
		/* -------------------------------------------------------------------------------------------------------------------------------------------- */
		
		/* -------------------------------------------------------------------------------------------------------------------------------------------- */
		/* 2. LETTURA DEL FILE 'indexParameters.csv' CONTENENTE GLI INPUT */
		// struttura: 'pathDatasets;nameDataset;pathIndexes;typePartition;num'
		val fileInput = "indexParameters.csv"															// file '.csv' contenente gli input
		println(s"<System> Starting the reading process for file '$fileInput'!")
		val (pathDatasets, nameDatasets, pathIndexes, typePartitions, nums) = analyzeCsv(fileInput)		// lettura e salvataggio degli input passati

		// eliminazione del file 'indexParameters.csv' con verifica
		//if (new File(fileInput).delete()) println(s"<System> The file '$fileInput' has been successfully deleted!")
		//else println(s"<System> Unable to delete file '$fileInput'!")
		/* -------------------------------------------------------------------------------------------------------------------------------------------- */

		/* -------------------------------------------------------------------------------------------------------------------------------------------- */
		/* 3. PROCESSO DI PARTIZIONE DEI DATASET E DI SALVATAGGIO DEI RISPETTIVI INDICI SPAZIALI */
		println("<System> Starting the dataset partitioning process!")

		val union = pathDatasets.zip(nameDatasets).zip(pathIndexes).zip(typePartitions).zip(nums)
		for (((((pathDataset, nameDataset), pathIndex), typePartition), num) <- union) {
			println(s"<System> Partitioning '$nameDataset'!")
			index(sc, pathDataset, nameDataset, pathIndex, typePartition, num)
			println(s"<System> Partitioning of dataset '$nameDataset' was successful!")
		}
		/* -------------------------------------------------------------------------------------------------------------------------------------------- */

		/* -------------------------------------------------------------------------------------------------------------------------------------------- */
		/* 5. CHIUSURA DEL CONTESTO SPARK */
		sc.stop()      
	}

	/* FUNZIONE 'analyzeCsv' */ 
	/* Funzione che passato in ingresso un file '.csv', restituisce liste corrispondenti alle colonne
	 * del file in ingresso (le colonne sono 'pathDatasets', 'nameDatasets', 'pathIndexes', 'typePartitions', 'num'):
	 * --> PARAMETRI IN INGRESSO: percorso del file (filePath)
	 * --> PARAMETRI IN USCITA: liste di stringhe e numeri (pathDatasets, nameDatasets, pathIndexes, typePartitions, nums)
	 */
	def analyzeCsv(filePath: String): (List[String], List[String], List[String], List[String], List[Int]) = {
		// Controllo che il file esista
		val file = new File(filePath)
		if (!file.exists() || !file.isFile) {
			throw new IllegalArgumentException(s"<System> The file '$filePath' does not exist or is not a valid file!")
		}
		
		val source = Source.fromFile(filePath)			// Apertura del file "filePath"
		val lines = source.getLines().toList			// Estrazione di tutte le righe del file in una lista di stringhe
		source.close()									// Chiusura del file "filePath"

		// Controllo che il file passato sia corretto e con la giusta intestazione
		val expectedHeader = "pathDatasets;nameDataset;pathIndexes;typePartition;num"
		if (lines.isEmpty || lines.head != expectedHeader) {
			throw new IllegalArgumentException(s"<System> The file '$filePath' is incorrect. Invalid header!")
		}

		val dataLines = lines.tail												// Rimuove l'intestazione
		val rows = dataLines.map(_.split(";").map(_.trim).toList).transpose		// Divide ogni riga per il separatore ";" e divide in colonne
		val pathDatasets: List[String] = rows(0)								// Lista contenete i percorsi dove trovo i datasets
		val nameDatasets: List[String] = rows(1)								// Lista contenente i nomi dei datasets
		val pathIndexes: List[String] = rows(2)									// Lista contenente il percorso dove salvare gli indici
		val typePartitions: List[String] = rows(3)								// Lista contenente i tipi di partizione richiesti (partitions || geometries || bits)
		val nums: List[Int] = rows(4).map(_.toInt)								// Lista contenente i numeri relativi alla tipologia di partizione

		(pathDatasets, nameDatasets, pathIndexes, typePartitions, nums)
	}

	/* FUNZIONE 'index' */
	/* Funzione che, passato in ingresso le informazioni sul dataset ed il contesto Spark,
	 * effettua la partizione del dataset e ne salva il correlato indice spaziale.
	 * --> PARAMETRI IN INGRESSO: contesto Spark (sc)
	 * 							  percorso dataset (pathDataset)
	 * 							  nom dataset (nameDataset)
	 * 							  tipologia partizione (typeOartition)
	 * 							  numero associato alla partizione (num)
	 */
	def index(sc: SparkContext, pathDataset: String, nameDataset: String, pathIndex: String, typePartition: String, num: Int): Unit = {
		val folderIndex = pathIndex											// MODIFICATO per funzionare correttamente in ambito docker

		// Calcolo il numero di partizioni in base alla tipologia di partizione scelta dall'utente
		val numPartitions = typePartition match{
			case "partitions" =>																				// l'utente vuole partizionare per "numero di partizioni"
				num																								// restituisco: numeroPartizioni
			case "geometries" =>																				// l'utente vuole partizionare per "numero di geometrie"
				val numGeom = Source.fromFile(pathDataset + "/" + nameDataset).getLines().size					// numero di righe = numero di geometrie nel dataset
				Math.max(1, numGeom / num)																		// restituisco: numeroGeometriTotali/numeroGeometriePerPartizione
			case "bits" =>																						// l'utente vuole partizionare per "dimensione di ciascuna partizione"
				val fileSize = new File(pathDataset + "/" + nameDataset).length()								// dimensione del file (in byte)
				Math.max(1, (fileSize / num).toInt)																// restituisco: dimensioneFileTotale/fimensioneSingolaPartizione
			case _ =>																							// il valore scritto come partizione, non è corretto
				println(s"<System> The partition type '$typePartition' is incorrect and cannot be accepted!")
				return
		}
		
		// Verifico che eventuali file con formato '.wkt' siano scritti con il giusto path interno
		if (nameDataset.endsWith(".wkt")){
			modifyWKT(nameDataset, pathDataset)
		}

		// Analizzo l'iesimo dataset, ne verifico il formato e partiziono. Flusso di esecuzione:
		// 1. carico l'i-esimo dataset
		// 2. effettuo la partizione dell'i-esimo dataset
		// 3. salvo l'indice spaziale generato
		if (nameDataset.endsWith(".wkt")){		// POLYGON
			val dataset = sc.spatialFile(s"$pathDataset/$nameDataset", "wkt", "separator" -> ",")
			val partitionedFeatures: RDD[IFeature] = dataset.spatialPartition(classOf[RSGrovePartitioner], numPartitions)
			partitionedFeatures.writeSpatialFile(s"$folderIndex/${nameDataset.stripSuffix(".wkt")}_spatialIndex", "wkt", "separator" -> ",")
		} else {								// POINT or BOX
			val source = Source.fromFile(s"$pathDataset/$nameDataset")
			val firstLine = source.getLines().next()
			source.close()
			val values = firstLine.split(",").map(_.trim)
			val pathGeom = values.length match{
				case 2 => "point(0,1)"
				case _ => "envelope(0,1,2,3)"
			}
			val dataset = sc.spatialFile(s"$pathDataset/$nameDataset", pathGeom, "separator" -> ",")
			val partitionedFeatures: RDD[IFeature] = dataset.spatialPartition(classOf[RSGrovePartitioner], numPartitions)
			partitionedFeatures.writeSpatialFile(s"$folderIndex/${nameDataset.stripSuffix(".csv")}_spatialIndex", pathGeom, "separator" -> ",")
		}
	}

	/* FUNZIONE 'modifyWKT' */
	/* Funzione che, passato in ingresso il nome di un file di tipo '.wkt', ne costruisce
	 * uno nuovo con la stessa struttura ma, per ogni riga, aggiunge ad inizio e fine il
	 * carattere " (solo se il file non è formattato già).
	 * --> PARAMETRI IN INGRESSO: nome del file da modificare (nameFile)
	 */
	def modifyWKT(nameFile: String, pathDataset: String): Unit = {
		val pathFile = pathDataset + "/" + nameFile;		// costruisco il path
		val inputFile = new File(pathFile)					// apro il file .wkt da modificare (input)
		val source = Source.fromFile(inputFile)				// attivo la sorgente sull'input file

		// verifico che il file passato sia da formattare effettivamente (che non inizi già con le virgolette)
		val lines = source.getLines()												// leggo le righe del file
		val formatted = lines.hasNext && !lines.next().trim.startsWith("\"")		// verifico se la prima riga esiste e inizia con virgolette
		if (!formatted) {															// se il file è già formattato, esco dalla funzione, altrimenti continuo per formattare
			source.close()
			return
		}

		val baseName = inputFile.getName.stripSuffix(".wkt")				// copio il nome del file togliendo l'estensione .wkt
		val outputFilePath = pathDataset + "/" + baseName + "_new.wkt"		// costruisco il nome del nuovo file corretto
		val outputFile = new File(outputFilePath)							// apro il nuovo file .wkt (output)
		val writer = new PrintWriter(outputFile)							// abilito la scrittura sull'output file

		// formattazione effettiva del nuovo file
		for (line <- source.getLines()) {						// leggo ogni linea del file in input
			if (line.nonEmpty)									// se la linea non è vuota
				writer.println("\"" + line + "\"")				// scrivo la linea nel file di output con le virgolette
		}

		// chiusura delle risorse
		source.close()
		writer.close()

		// rimozione del file non formattato e correzione del nome del nuovo file
		inputFile.delete()
		outputFile.renameTo(new File(pathDataset + "/" + baseName + ".wkt"))
	}
}