import edu.ucr.cs.bdlab.beast._
import edu.ucr.cs.bdlab.beast.geolite.{EnvelopeNDLite, IFeature}
import org.apache.spark.{SparkConf, SparkContext}
import org.apache.spark.rdd.RDD
import org.apache.spark.util.LongAccumulator
import org.locationtech.jts.geom.{Coordinate, GeometryFactory, Polygon}
import java.nio.file.Paths
import java.io.{File, FileWriter, FileNotFoundException}
import scala.io.{Source, StdIn}
import edu.ucr.cs.bdlab.beast.indexing.RSGrovePartitioner

object RangeQueryApp {

	// Funzione che calcola i parametri correlati alla range query corrispondente
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

	// Funzione che restituisce la geometria interna del dataset selezionato
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

	// Funzione che permette la scrittura sul file dei risultati ricavati da ciascuna rangequery
	def saveGroundTruthToFile(datasetName: String, queryNumber: String, queryArea: Double, minX: Double, minY: Double, maxX: Double, maxY: Double, areaInt: Double, groundTruth: Double, filename: String, mbrCount: Long, time: Long): Unit = {
		val writer = new FileWriter(new File(filename), true)
		try {
			val groundTruthLine = s"$datasetName;$queryNumber;$queryArea;$minX;$minY;$maxX;$maxY;$areaInt;$groundTruth;$time;$mbrCount"
			writer.write(groundTruthLine + "\n")
		} finally {
			writer.close()
		}
	}

	// Funzione che legge la grandezza della finestra contenente il dataset
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

	def analyzeCsv(filePath: String): (String, String, String, String, String, String, String) = {
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

		val dataLine = lines.tail.head						// Rimuove l'intestazione
		val values = dataLine.split(";").map(_.trim)		// Divide ogni riga per il separatore ";" e divide in colonne
		val pathDatasets: String = values(0)				// Percorso dove trovo il dataset
		val nameDataset: String = values(1)					// Nome del dataset
		val pathSummaries: String = values(2)				// Percorso dove trovo il sommario dei datasets
		val nameSummary: String = values(3)					// Nome del sommario dei datasets
		val pathIndex: String = values(4)					// Percorso dove trovo l'indice spaziale correlato al dataset in questione
		val pathRangeQueries: String = values(5)			// Percorso dove trovo il file contenente le range queries correlate ai datasets
		val nameRangeQueries: String = values(6)			// Nome del file contenente le range queries correlate ai datasets

		(pathDatasets, nameDataset, pathSummaries, nameSummary, pathIndex, pathRangeQueries, nameRangeQueries)
	}

	def main(args: Array[String]): Unit = {
		val fileInput = "rangeParameters.csv"												// file '.csv' contenente gli input
		println(s"<System> Starting the reading process for file '$fileInput'!")
		
		// lettura e salvataggio degli input passati
		// struttura: 'pathDatasets;nameDataset;pathSummaries;nameSummary;pathIndexes;pathRangeQueries;nameRangeQueries'
		val (pathDatasets, nameDataset, pathSummaries, nameSummary, pathIndex, pathRangeQueries, nameRangeQueries) = analyzeCsv(fileInput)
		val nameOutputFile = "rqR_" + nameDataset
		val outputFilePath = "rangeQueriesResult" + pathDatasets.dropWhile(_ != '/') + "/" + nameOutputFile
		val outputDir = new File(outputFilePath).getParentFile
		if (!outputDir.exists()) {
			outputDir.mkdirs()			// crea tutte le directory necessarie se non esistono già
		}

		// eliminazione del file 'indexParameters.csv' con verifica
		//if (new File(fileInput).delete()) println(s"<System> The file '$fileInput' has been successfully deleted!")
		//else println(s"<System> Unable to delete file '$fileInput'!")

		// salvataggio effettivo del nome del dataset da analizzare
		val startDatasetName = nameDataset.stripSuffix(".csv").stripSuffix(".wkt")

		// salvataggio della geometria del dataset
		val geometry = getGeometry(startDatasetName, pathSummaries, nameSummary)

		val conf = new SparkConf().setAppName("Beast Example").setMaster("local[*]")	// creazione della configurazione Spark (SparkConf)
		val sc = new SparkContext(conf)													// creazione del contesto Spark (SparkContext)

		// Scrittura dell'header nel file da restituire come output
		val headerWriter = new FileWriter(new File(outputFilePath), false)				// Overwrite mode
		try {
			headerWriter.write("datasetName;numQuery;queryArea;minX;minY;maxX;maxY;areaint;cardinality;executionTime;mbrTests\n")
		} finally {
			headerWriter.close()
		}

		// lettura del file con le query, riga per riga
		val bufferedSource = Source.fromFile(pathRangeQueries + "/" + nameRangeQueries)
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
							val (datasetMinX, datasetMinY, datasetMaxX, datasetMaxY) = readMBRValues(datasetName, pathRangeQueries + "/" + nameRangeQueries)
							
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
							val (groundTruthValues: Double, mbrCount: Long, time: Long) = calculateGroundTruthValues(sc, range, datasetName, 0, pathDatasets, pathIndex, geometry)

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