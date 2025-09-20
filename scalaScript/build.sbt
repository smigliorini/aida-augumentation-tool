import Dependencies._

ThisBuild / scalaVersion     := "2.12.12"
ThisBuild / version          := "0.1.0-SNAPSHOT"

resolvers += "OSGeo Repository" at "https://repo.osgeo.org/repository/release/"


// Main class per il JAR eseguibile
Compile / mainClass := Some("Main")
assembly / mainClass := Some("Main")

lazy val root = (project in file("."))
  .settings(
    name := "scala",
	  fork := true,
    libraryDependencies ++= Seq(
      "org.apache.spark" %% "spark-core" % "3.1.1",
      "org.apache.spark" %% "spark-sql" % "3.1.1",
      "org.apache.hadoop" % "hadoop-common" % "3.2.0",
      "org.locationtech.jts" % "jts-core" % "1.18.2",
      "org.geotools" % "gt-metadata" % "26.2",
      "org.geotools" % "gt-referencing" % "26.2",
      "org.geotools" % "gt-epsg-hsql" % "26.2",
      "org.scalameta" %% "munit" % "0.7.29" % Test,
    )
  )
