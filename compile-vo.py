import re
import csv
import time
from datetime import datetime, timezone
import json
from voicevox import Client 
import asyncio 
import random
import subprocess
import os
import argparse

# Record the start time
start_time = time.time()

# Valid speaker IDs we can use
# speaker_ids = [6,9,11,13,20,21,32,40]
speaker_ids = [6,9,11,13,20,21]

def print_progress_bar(iteration, total, length=50):
    percent = f"{100 * (iteration / float(total)):.0f}"
    filled_length = int(length * iteration // total)
    bar = '█' * filled_length + '-' * (length - filled_length)
    print(f'\rProgress: [{bar}] {percent}%', end="\r", flush=True)

import subprocess

def convert_wav_to_mp3(input_wav, output_mp3):
    command = [
        'ffmpeg', 
        '-i', input_wav,  # Input file
        '-codec:a', 'libmp3lame',  # Audio codec
        '-qscale:a', '4',  # Quality setting (2 is high quality)
        '-y',  # Overwrite output file if it exists
        '-loglevel', 'error',  # Suppress log output
        output_mp3  # Output file
    ]
    try:
        subprocess.run(command, check=True)
        os.remove(input_wav)
    except subprocess.CalledProcessError as e:
        print(f"An error occurred: {e}")

async def synthesize_audio(text, filename):
    async with Client() as client:
        speaker_id = random.choice(speaker_ids)
        audio_query = await client.create_audio_query(
            text, speaker=speaker_id 
        )
        with open(filename, "wb") as f: 
            f.write(await audio_query.synthesis(speaker=speaker_id))

        return speaker_id

def main(text, filename):
    asyncio.run(synthesize_audio(text, filename))

def strip_highlighting(marked_sentence):
    # Regular expression to match the highlighting markup and capture the inner text
    pattern = re.compile(r'{\d+[a-z]?:([^}]+)}')

    # Function to replace the matched pattern with the captured group (inner text)
    def replace_highlighting(match):
        return match.group(1)

    # Apply the substitution
    stripped_sentence = pattern.sub(replace_highlighting, marked_sentence)
    return stripped_sentence

def parse_csv(file_path, generate_vo, update_only):
    sentences = []
    audio_file_num = 1
    with open(file_path, mode='r', encoding='utf-8') as file:
        reader = csv.reader(file)
        next(reader)  # Skip the header row

        for row in reader:
            if len(row) < 3:
                continue  # Skip rows that don't have at least 3 columns
            # Create a dictionary for each row
            output_filename = f"{audio_file_num:04}.wav"
            output_dir = "voxdata/"
            row_data = {
                'sentence': row[0],
                'translation': row[1],
                'contexts': [concept.strip() for concept in row[2].split(',')],
                'audio': output_filename,
                'level': row[3],
                'attribution': row[4],
                'attrurl': row[5]
            }
            sentences.append(row_data)
            audio_file_num += 1

    # Synthesize audio for each sentence
    total_audio_files = audio_file_num - 1;
    audio_file_num = 0
    print("Valid sentences found: ", total_audio_files)
    for sentence in sentences:
        plain_sentence = strip_highlighting(sentence['sentence'])
        wav_name = sentence['audio']
        mp3_name = wav_name.replace('.wav', '.mp3')
        sentence['audio'] = mp3_name
        if generate_vo:
            # Skip if the file already exists
            if update_only and os.path.exists(output_dir + mp3_name):
                audio_file_num += 1
                continue

            # Generate the VO
            main(plain_sentence, output_dir + wav_name)
            convert_wav_to_mp3(output_dir + wav_name, output_dir + mp3_name)
            audio_file_num += 1
            print_progress_bar(audio_file_num, total_audio_files)

    utc_now = datetime.now(timezone.utc)
    utc_timestamp = utc_now.timestamp()

    data = { 
        'version': "0.2",
        'timestamp': utc_now.isoformat(),
        'sentences': sentences,
    }

    return data

def convert_to_json(data):
    return json.dumps(data, ensure_ascii=False, indent=4)

# Main
if __name__ == "__main__":
    # Command-line options
    parser = argparse.ArgumentParser(description="NListen Data Importer")
    parser.add_argument('--data', action='store_true', help='Only compile new data, leave the VO')
    parser.add_argument('--update', action='store_true', default=False, help='Only add new VO lines, don\'t alter old ones')
    args = parser.parse_args()

    print("\nParsing file...")

    if args.data:
        print("Data only mode enabled")

    if args.update:
        print("Update only mode enabled")

    file_path = 'source.csv'
    data = parse_csv(file_path, not args.data, args.update)

    # json_data = convert_to_json(datwith open(filename, 'w', encoding='utf-8') as file:
    filename = "data.json"
    with open(filename, 'w', encoding='utf-8') as file:
        json.dump(data, file, ensure_ascii=False, indent=4)

    # Record the end time
    end_time = time.time()

    # Calculate the elapsed time
    elapsed_time = end_time - start_time
    print(f"\nDone! ({elapsed_time:.1f} seconds)")
