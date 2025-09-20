FROM python:3.10-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y openjdk-11-jdk wget

RUN wget https://github.com/sbt/sbt/releases/download/v1.9.9/sbt-1.9.9.tgz && \
    tar -xvzf sbt-1.9.9.tgz && \
    mv sbt /usr/share/sbt && \
    ln -s /usr/share/sbt/bin/sbt /usr/bin/sbt && \
    rm sbt-1.9.9.tgz

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "-u", "server.py"]