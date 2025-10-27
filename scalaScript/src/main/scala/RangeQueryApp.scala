import edu.ucr.cs.bdlab.beast._
import edu.ucr.cs.bdlab.beast.geolite.{EnvelopeNDLite, IFeature}
import org.apache.spark.{SparkConf, SparkContext}
import org.apache.spark.rdd.RDD
import org.apache.spark.util.LongAccumulator
import org.locationtech.jts.geom.{Coordinate, GeometryFactory, Polygon}
import java.nio.file.Paths
import java.io.{File, FileWriter, PrintWriter, FileNotFoundException}
import scala.io.{Source, StdIn}
import edu.ucr.cs.bdlab.beast.indexing.RSGrovePartitioner

object RangeQueryApp {
	
	/* FUNZIONE "analyzeCsv" */
	/* Funzione che prende in input il path di un file ".csv" e restituisce liste contenenti le
	 * informazioni necessarie per processare i dataset con le rispettive range queries.
	 * Le colonne del file sono: 'pathDatasets', 'nameDataset', 'pathSummaries', 'nameSummary', 'pathIndexes', 'pathRangeQueries' e 'nameRangeQueries'.
	 * Input: filePath --> nome del file contenente i dati;
	 * Output: pathDatasets --> lista contenente i percorsi di ciascun dataset;
	 * 		   nameDataset --> lista contenenti i nomi dei datasets;
	 * 		   pathSummaries --> lista contenente il percorso in cui sono salvati gli indici spaziali;
	 * 		   nameSummary --> lista contenente il nome del sommario in questione;
	 * 		   pathIndex --> lista contenente i percorsi dell'indice spaziale correlati a ciascun dataset;
	 * 		   pathRangeQueries --> lista contenente il nome del folder in cui rcavare le range queries in input;
	 * 		   nameRangeQueries --> lista cpntenente il nome del file contenente le range queries in input.
	 */
	def analyzeCsv(filePath: String): (List[String], List[String], List[String], List[String], List[String], List[String], List[String]) = {
		// Controllo che il file esista
		val file = new File(filePath)
		if (!file.exists() || !file.isFile) {
			throw new IllegalArgumentException(s"<System> The file '$filePath' does not exist or is not a valid file!")
		}
		
		val source = Source.fromFile(filePath)			// Apertura del file "filePath"
		val lines = source.getLines().toList			// Estrazione di tutte le righe del file in una lista di stringhe
		source.close()									// Chiusura del file "filePath"

		// Controllo che il file passato sia corretto e con la giusta intestazione
		val expectedHeader = "pathDatasets;nameDataset;pathSummaries;nameSummary;pathIndexes;pathRangeQueries;nameRangeQueries"
		if (lines.isEmpty || lines.head != expectedHeader) {
			throw new IllegalArgumentException(s"<System> The file '$filePath' is incorrect. Invalid header!")
		}

		val dataLine = lines.tail													// Rimuove l'intestazione
		val values = dataLine.map(_.split(";").map(_.trim).toList).transpose		// Divide ogni riga per il separatore ";" e divide in colonne
		val pathDatasets: List[String] = values(0)									// Percorso dove trovo il dataset
		val nameDatasets: List[String] = values(1)									// Nome del dataset
		val pathSummaries: List[String] = values(2)									// Percorso dove trovo il sommario dei datasets
		val nameSummaries: List[String] = values(3)									// Nome del sommario dei datasets
		val pathIndexes: List[String] = values(4)									// Percorso dove trovo l'indice spaziale correlato al dataset in questione
		val pathRangeQueries: List[String] = values(5)								// Percorso dove trovo il file contenente le range queries correlate ai datasets
		val nameRangeQueries: List[String] = values(6)								// Nome del file contenente le range queries correlate ai datasets

		(pathDatasets, nameDatasets, pathSummaries, nameSummaries, pathIndexes, pathRangeQueries, nameRangeQueries)
	}

	/* FUNZIONE "getGeometry" */
	/* Funzione che restituisce la geometria interna del dataset selezionato
	 * Input: datasetName --> nome del dataset in analisi;
	 * 		  pathSummaries --> percorso contenente il file con il sommario;
	 * 		  fileSummaries --> nome del file contenente il sommario dei dataset;
	 * Output: result --> geometria del dataset.
	 */
	def getGeometry(datasetName: String, pathSummaries: String, fileSummaries: String): String = {
		val bufferedSource = Source.fromFile(pathSummaries + "/" + fileSummaries)			// apertura del file contenente i dettagli sui dataset
		val header = bufferedSource.getLines().take(1).next().split(";").map(_.trim)		// lettura della prima riga del file (header) --> header("datasetName", "distribution", "geometry", ...)
		val geometryIndex = header.indexOf("geometry")										// ricerca indice di "geometry" in "header"
		val datasetIndex = header.indexOf("datasetName")									// ricerca indice di "datasetName" in "header"

		val result = bufferedSource.getLines().collectFirst {								// voglio salvare la geometria in "result"
			case line if line.split(";")(datasetIndex).trim == datasetName =>				// cerco la riga che abbia come "datasetName" quello che sto analizzando
				line.split(";")(geometryIndex).trim											// individuata la riga, prendo la "geometry" corrispondente
		}

		bufferedSource.close()		// chiusura del file
		result.getOrElse {			// restituzione della geometria presente nel dataset
			throw new NoSuchElementException(s"<System> Geometry for dataset $datasetName not found in $fileSummaries")
		}
	}

	/* FUNZIONE "readMBRValues" */
	/* Funzione che legge la grandezza della finestra contenente il dataset 
	 * Input: datasetName --> nome del dataset in analisi;
	 * 		  mbrFilePath --> percorso contenente le range queries
	 * Output: minX --> finestra dataset minX;
	 * 		   minY --> finestra dataset minY;
	 * 		   maxX --> finestra dataset maxX;
	 * 		   maxY --> finestra dataset maxY.
	 */
	def readMBRValues(datasetName: String, mbrFilePath: String): (Double, Double, Double, Double) = {
		val bufferedSource = Source.fromFile(mbrFilePath)
		for (line <- bufferedSource.getLines()) {
			val cols = line.split(";").map(_.trim)
			if (cols(0) == datasetName) {
				val minX = cols(3).toDouble				// minX finestra del dataset
				val minY = cols(4).toDouble				// minY finestra del dataset
				val maxX = cols(5).toDouble				// maxX finestra del dataset
				val maxY = cols(6).toDouble				// maxY finestra del dataset
				bufferedSource.close()
				return (minX, minY, maxX, maxY)
			}
		}
		bufferedSource.close()
		throw new Exception(s"Dataset $datasetName not found in $mbrFilePath")
	}

	/* FUNZIONE "calculateGroundTruthValues"" */
	/* Funzione che calcola i parametri correlati alla range query corrispondente
	 * Input: 
	 * Output: 
	 */
	def calculateGroundTruthValues(sc: SparkContext, range: EnvelopeNDLite, filename: String, factor: Int, datasetFolder: String, indexFolder: String, geometry: String): (Double, Long, Long) = {
		// Costruzione geometrica effettiva della finestra di range query (poligono rettangolare)
		val geometryFactory = new GeometryFactory()
		val envelopePolygon: Polygon = {
			val coordinates = Array(
				new Coordinate(range.getMinCoord(0), range.getMinCoord(1)),			// minX, minY finestra di query
				new Coordinate(range.getMinCoord(0), range.getMaxCoord(1)),			// minX, maxY finestra di query
				new Coordinate(range.getMaxCoord(0), range.getMaxCoord(1)),			// maxX, maxY finestra di query
				new Coordinate(range.getMaxCoord(0), range.getMinCoord(1)),			// maxX, minY finestra di query
				new Coordinate(range.getMinCoord(0), range.getMinCoord(1))			// ripetizione prima coordinata per chiudere il poligono
			)
			geometryFactory.createPolygon(coordinates)
		}

		// Preparazione del dataset da analizzare su cui operare la range query
		val (polygons, loadedPartitioned) =
			if (geometry == "point"){			// POINT
				val fileN = filename + ".csv"																	// costruzione del file contenente il dataset
				val p = sc.spatialFile(s"$datasetFolder/$fileN", "point(0,1)", "separator" -> ",")				// caricamento del dataset
				val l = sc.spatialFile(s"$indexFolder", "point(0,1)", "separator" -> ",")						// caricamento dell'indice spaziale
				(p, l)
			} else if (geometry == "box"){		// BOX
				val fileN = filename + ".csv"																	// costruzione del file contenente il dataset
				val p = sc.spatialFile(s"$datasetFolder/$fileN", "envelope(0,1,2,3)", "separator" -> ",")		// caricamento del dataset
				val l = sc.spatialFile(s"$indexFolder", "envelope(0,1,2,3)", "separator" -> ",")				// caricamento dell'indice spaziale
				(p, l)
			} else {							// POLYGON
				val fileN = filename + ".wkt"																	// costruzione del file contenente il dataset
				val p = sc.spatialFile(s"$datasetFolder/$fileN", "wkt", "separator" -> ",")						// caricamento del dataset
				val l = sc.spatialFile(s"$indexFolder", "wkt", "separator" -> ",")								// caricamento dell'indice spaziale
				(p, l)
			}
		
		// Calcolo dei parametri da restituire in base alla query che viene eseguita
		val mbrCount: LongAccumulator = sc.longAccumulator("mbrCount")						// creazione dell'accumulatore "mbrCount"
		val startTime = System.nanoTime()													// parte il cronometro
		val matchedPolygons = loadedPartitioned.rangeQuery(envelopePolygon, mbrCount)		// esecuzione range query: ricerca geometrie dataset che intersecano la finestra, aggiornamento di mbrCount
		val endTime = System.nanoTime()														// si ferma il cronometro
		val elapsedTime = (endTime - startTime) / 1e6.toLong								// calcolo del tempo di esecuzione in millisecondi
		val count: Double = matchedPolygons.count()											// conta quante geometrie sono interessate dall'intersezione con la finestra di query 
		val totalNumGeometries = polygons.count() - factor									// Conta il numero totale di geometrie presenti nel dataset originale
		val normalizedCount = count / totalNumGeometries									// calcola la cardinalità normalizzata (percentuale di geometrie matchate rispetto al totale)
		val mbrCountValue = mbrCount.value													// estrazione del valore di "mbrCount", quanti MBR sono stati testati nella query

		(normalizedCount, mbrCountValue, elapsedTime)										// restituzione dei dati calcolati
	}

	/* FUNZIONE "saveGroundTruthToFile" */
	/* Funzione che permette la scrittura sul file dei risultati ricavati da ciascuna rangequery
	 * Input: 
	 * Output: 
	 */
	def saveGroundTruthToFile(datasetName: String, queryNumber: String, queryArea: Double, minX: Double, minY: Double, maxX: Double, maxY: Double, areaInt: Double, groundTruth: Double, filename: String, mbrCount: Long, time: Long): Unit = {
		val writer = new FileWriter(new File(filename), true)
		try {
			val groundTruthLine = s"$datasetName;$queryNumber;$queryArea;$minX;$minY;$maxX;$maxY;$areaInt;$groundTruth;$time;$mbrCount"
			writer.write(groundTruthLine + "\n")
		} finally {
			writer.close()
		}
	}




	
	def main(args: Array[String]): Unit = {
		val fileInput = "rangeParameters.csv"												// file '.csv' contenente gli input
		println(s"<System> Starting the reading process for file '$fileInput'!")
		val (pathDatasets, nameDatasets, pathSummaries, nameSummaries, pathIndexes, pathRangeQueries, nameRangeQueries) = analyzeCsv(fileInput)

		// eliminazione del file 'rangeParameters.csv' con verifica
		//if (new File(fileInput).delete()) println(s"<System> The file '$fileInput' has been successfully deleted!")
		//else println(s"<System> Unable to delete file '$fileInput'!")

		val union = pathDatasets.zip(nameDatasets).zip(pathSummaries).zip(nameSummaries).zip(pathIndexes).zip(pathRangeQueries).zip(nameRangeQueries)
		for (((((((pathDataset, nameDataset), pathSummary), nameSummary), pathIndex), pathRangeQuery), nameRangeQuery) <- union){
			val nameOutputFile = "rqR_" + pathDataset.split("/").last + ".csv"		// "rqR_datasetsDate_Time_UniqueCode.csv"
			val outputFilePath = "../" + "rangeQueriesResult/" + nameOutputFile		// "rangeQueriesResult/rqR_datasetsDate_Time_UniqueCode.csv"
			val outputDir = new File(outputFilePath).getParentFile					// tentativo di apertura della directory "rangeQueriesResult"
			if (!outputDir.exists()) {												// se non esiste ...
				outputDir.mkdirs()													// ... crea la directory necessaria
			}

			val startDatasetName = nameDataset.stripSuffix(".csv").stripSuffix(".wkt")		// salvataggio effettivo del nome del dataset da analizzare
			val geometry = getGeometry(startDatasetName, pathSummary, nameSummary)			// salvataggio del tipo di geometria del dataset selezionato
			println(s"<System> The dataset you want to analyze is '$startDatasetName'. His geometry is '$geometry'")

			// verifico se esiste già o meno il file di output
			println(s"<System> Output file analysis ('$startDatasetName').")
			val file = new File(outputFilePath)
			
			// se il file esiste già, va controllato al suo interno se ci sono righe corrispondenti a "startDatasetName" e, in caso affermativo, eliminate
			if (file.exists && file.isFile) {

				val lines = Source.fromFile(file).getLines().toList							// leggo tutte le righe presenti nel file
				val filteredLines = lines.filterNot(_.startsWith(startDatasetName))			// filtro le righe che NON iniziano con "startDatasetName"

				// sovrascrive il file con le righe filtrate
				val writer = new PrintWriter(file)
				try {
					filteredLines.foreach(writer.println)
				} finally {
					writer.close()
				}

			} else {
				// creazione del file con solo l'header inserito
				val header = "datasetName;numQuery;queryArea;minX;minY;maxX;maxY;areaint;cardinality;executionTime;mbrTests"
				val writer = new PrintWriter(file)
				try {
					writer.println(header)
				} finally {
					writer.close()
				}
			}

			val conf = new SparkConf().setAppName("Beast Example").setMaster("local[*]")	// creazione della configurazione Spark (SparkConf)
			val sc = new SparkContext(conf)													// creazione del contesto Spark (SparkContext)

			// lettura del file con le query, riga per riga
			val bufferedSource = Source.fromFile(pathRangeQuery + "/" + nameRangeQuery)
			println()

			for ((line, lineNumber) <- bufferedSource.getLines().drop(1).zipWithIndex) {	// salta la prima riga, header

				val cols = line.split(";").map(_.trim)
				if (cols.length >= 7) {

					try {
						val datasetName = cols(0).stripMargin.replaceAll("\"", "")
						if (datasetName == startDatasetName) {
							val minX = cols(3).replace("\"", "").toDouble					// minX finestra di query
							val minY = cols(4).replace("\"", "").toDouble					// minY finestra di query
							val maxX = cols(5).replace("\"", "").toDouble					// maxX finestra di query
							val maxY = cols(6).replace("\"", "").toDouble					// maxY finestra di query
							val queryNumber = cols(1).stripMargin.replaceAll("\"", "")		// numero della query
						
							println()
							println()
							println(s"<System> Analyze query '$queryNumber' on dataset '$datasetName'")

							val range = new EnvelopeNDLite(2, minX, minY, maxX, maxY)		// range bidimensionale per la creazione della finestra di query
							val queryArea = (maxX - minX) * (maxY - minY)					// calcolo area di query

							try {
								// restituisce i valori minimi e massimi della finestra contenente il dataset
								val (datasetMinX, datasetMinY, datasetMaxX, datasetMaxY) = readMBRValues(datasetName, pathRangeQuery + "/" + nameRangeQuery)
								
								// devo controllare se la finestra di query esce dalla finestra del dataset
								val a = if (minX > datasetMinX) minX else datasetMinX 
								val b = if (minY > datasetMinY) minY else datasetMinY
								val c = if (maxX < datasetMaxX) maxX else datasetMaxX
								val d = if (maxY < datasetMaxY) maxY else datasetMaxY

								// calcolo l'area di query effettiva (esclusa la porzione che esce dalla finestra del dataset)
								var areaInt = (c - a) * (d - b)
								if (areaInt < 0) {
									areaInt = 0
								}

								// calcolo dei tre parametri
								val (groundTruthValues: Double, mbrCount: Long, time: Long) = calculateGroundTruthValues(sc, range, datasetName, 0, pathDataset, pathIndex, geometry)

								// salvataggio dei tre parametri nel file di output
								saveGroundTruthToFile(datasetName, queryNumber, queryArea, minX, minY, maxX, maxY, areaInt, groundTruthValues, outputFilePath, mbrCount, time)
							} catch {
								case e: FileNotFoundException =>
									println(s"<System> File $datasetName not found. Skipping to the next dataset!")
							}

						}

					} catch {
						case e: NumberFormatException =>
							println(s"<System> Error parsing line $lineNumber: ${e.getMessage}!")
					}

				} else {
					println(s"<System> Error parsing line $lineNumber: Insufficient columns!")
				}
			}

			bufferedSource.close()
			sc.stop()

		}
	}
}