#!/bin/bash

# Path to your CSV file
csv_file="summaries/sum_datasetsTest_cu.csv"

LOG_FILE="datasets/datasetsTest_cu/commands.log"

# Function to execute the generator script
execute_generator() {
    distribution=$1
    geometry=$2
    cardinality=$3
    polysize=$4
    output_file=$5
    maxseg=$6
    width=$7
    height=$8
    affinematrix=$9
    
    if [ "$geometry" = "polygon" ]; then # wkt
    	format="wkt"
    else
    	format="csv"
    fi

    if [ "$distribution" = "uniform" ]; then # uniform
        command="python3 generator.py distribution=uniform cardinality=$cardinality dimensions=2 geometry=$geometry polysize=$polysize maxseg=$maxseg format=$format affinematrix=$affinematrix maxsize=$width,$height affinematrix=$affinematrix"
        
        
    elif [ "$distribution" = "diagonal" ]; then # diagonal
        command="python3 generator.py distribution=diagonal cardinality=$cardinality dimensions=2 percentage=0.5 buffer=0.5 geometry=$geometry polysize=$polysize maxseg=$maxseg format=$format affinematrix=$affinematrix maxsize=$width,$height affinematrix=$affinematrix"
        
        
    elif [ "$distribution" = "gaussian" ]; then # gaussian
        command="python3 generator.py distribution=gaussian cardinality=$cardinality dimensions=2 geometry=$geometry polysize=$polysize maxseg=$maxseg format=$format affinematrix=$affinematrix maxsize=$width,$height affinematrix=$affinematrix"
        
        
    elif [ "$distribution" = "sierpinski" ]; then # sierpinski
        command="python3 generator.py distribution=sierpinski cardinality=$cardinality dimensions=2 geometry=$geometry polysize=$polysize maxseg=$maxseg format=$format affinematrix=$affinematrix maxsize=$width,$height affinematrix=$affinematrix"
        
        
    elif [ "$distribution" = "bit" ]; then # bit
        command="python3 generator.py distribution=bit cardinality=$cardinality dimensions=2 probability=0.2 digits=10 geometry=$geometry polysize=$polysize maxseg=$maxseg format=$format affinematrix=$affinematrix maxsize=$width,$height affinematrix=$affinematrix"
        
        
    elif [ "$distribution" = "parcel" ]; then # parcel
        command="python3 generator.py distribution=parcel cardinality=$cardinality dimensions=2 srange=0.5 dither=0.5 polysize=$polysize maxseg=$maxseg format=$format affinematrix=$affinematrix affinematrix=$affinematrix"
    else
        echo "Unknown distribution: $distribution"
        return
    fi

    # Execute the command and save to the output file
    eval $command  > "$output_file"
    # Run the command and save it to the log file
    echo "$command" >> "$LOG_FILE"
}

# Read the CSV file and execute the generator for each row
total_datasets=$(wc -l < "$csv_file")
log_file="commands.log"

echo "Generating datasets..."
echo ""

# Loop through each row in the CSV file
while IFS=";" read -r datasetName distribution geometry x1 y1 x2 y2 num_features max_seg num_points avg_area avg_side_length_0 avg_side_length_1 E0 E2; do
    echo "Processing dataset: $datasetName"
    echo "Distribution: $distribution"
    echo "Geometry: $geometry"
    echo "Cardinality: $num_features"
    echo ""
    
    if [ "$geometry" = "polygon" ]; then # wkt
    	output_file="datasets/datasetsTest_cu/$datasetName.wkt"
    else
    	output_file="datasets/datasetsTest_cu/$datasetName.csv"
    fi
    
    # MA settings
    a1=$(echo "$x2 - $x1" | bc)
    a3=$x1
    a5=$(echo "$y2 - $y1" | bc)
    a6=$y1
    matrix="$a1,0,$a3,0,$a5,$a6"
    
    # Call the execute_generator function with the row data
    execute_generator "$distribution" "$geometry" "$num_features" "$avg_area" "$output_file" "$max_seg" "$avg_side_length_0" "$avg_side_length_1" "$matrix"
done < <(tail -n +2 "$csv_file")

echo "Generation complete"
