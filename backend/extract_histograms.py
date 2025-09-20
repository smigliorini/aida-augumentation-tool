import os
import numpy as np
import argparse
import datetime

def process_input_file(input_filename, x1, y1, x2, y2, num_rows, num_columns):
    hist = np.zeros((num_rows, num_columns))
    box_data = {}

    d1 = (x2 - x1) / num_columns
    d2 = (y2 - y1) / num_rows

    with open(input_filename, 'r') as input_f:
        for line in input_f:
            data = line.strip().split(',')
            xmin = float(data[0])
            ymin = float(data[1])
            xmax = float(data[2])
            ymax = float(data[3])
            x_centroid = (xmin + xmax) / 2
            y_centroid = (ymin + ymax) / 2
            col = int((x_centroid - x1) / d1)
            row = int((y_centroid - y1) / d2)

            if 0 <= row < num_rows and 0 <= col < num_columns:
                hist[row, col] += 1
                if (row, col) not in box_data:
                    box_data[(row, col)] = []
                box_data[(row, col)].append((xmin, ymin, xmax, ymax))

    return hist, box_data

def calculate_bin_metrics(box_data):
    output_data = []
    for (row, col), boxes in box_data.items():
        num_features = len(boxes)
        size = num_features * 16
        num_points = num_features * 4
        total_area = 0
        total_side_length_0 = 0
        total_side_length_1 = 0

        for xmin, ymin, xmax, ymax in boxes:
            area = (xmax - xmin) * (ymax - ymin)
            total_area += area
            total_side_length_0 += (xmax - xmin)
            total_side_length_1 += (ymax - ymin)

        avg_area = total_area / num_features
        avg_side_length_0 = total_side_length_0 / num_features
        avg_side_length_1 = total_side_length_1 / num_features

        output_data.append((row, col, num_features, size, num_points, avg_area, avg_side_length_0, avg_side_length_1))
    return output_data

def extract_histogram(input_filename, output_filename, num_rows, num_columns):
    # Usiamo valori fissi per x1, y1, x2, y2 come nel codice originale
    x1, y1, x2, y2 = 0, 0, 10, 10
    hist, box_data = process_input_file(input_filename, x1, y1, x2, y2, num_rows, num_columns)
    output_data = calculate_bin_metrics(box_data)

    # Assicurati che la directory di output esista
    os.makedirs(os.path.dirname(output_filename), exist_ok=True)

    with open(output_filename, 'w') as output_f:
        output_f.write('i0,i1,num_features,size,num_points,avg_area,avg_side_length_0,avg_side_length_1\n')
        for row, col, num_features, size, num_points, avg_area, avg_side_length_0, avg_side_length_1 in output_data:
            output_f.write(f'{row},{col},{num_features},{size},{num_points},{avg_area},{avg_side_length_0},{avg_side_length_1}\n')

def main():
    parser = argparse.ArgumentParser(description='Process histogram extraction.')
    parser.add_argument('--input', type=str, required=True, help='Path to the input CSV file.')
    parser.add_argument('--output', type=str, required=True, help='Path to the output summary CSV file.')
    parser.add_argument('--rows', type=int, default=128, help='Number of rows for the histogram grid.')
    parser.add_argument('--columns', type=int, default=128, help='Number of columns for the histogram grid.')
    args = parser.parse_args()

    # Chiamiamo direttamente extract_histogram con gli argomenti della riga di comando
    extract_histogram(args.input, args.output, args.rows, args.columns)

if __name__ == '__main__':
    main()