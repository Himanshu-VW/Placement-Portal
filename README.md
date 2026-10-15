# placement-portal-application
Placement Portal Application helps institutes require efficient systems to manage campus recruitment activities involving companies and students.

## Application-history CSV export

Students can select **My Applications** then **Export as CSV**. The request is queued
in Celery, and the dashboard alerts the student when the protected CSV download is
ready. The export includes the student ID, company, drive title, current status,
application date, last status-update date, and interview date.

### Local setup (Windows)

1. Install Python packages from the project root:

   ```powershell
   .\venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

2. Install and start Redis. The most reliable local option on Windows is WSL:

   ```powershell
   wsl --install -d Ubuntu
   ```

   Restart if prompted, open **Ubuntu**, then run:

   ```bash
   sudo apt update
   sudo apt install redis-server
   sudo service redis-server start
   redis-cli ping
   ```

   `PONG` confirms Redis is running. WSL's default networking makes it available
   to the Windows Flask and Celery processes at `localhost:6379`.

3. In one PowerShell terminal, start the Celery worker:

   ```powershell
   cd backend
   ..\venv\Scripts\celery.exe -A celery_app.celery worker --loglevel=info --pool=solo
   ```

   `--pool=solo` avoids the Windows multiprocessing limitation.

4. In a second PowerShell terminal, start the API:

   ```powershell
   cd backend
   ..\venv\Scripts\python.exe app.py
   ```

The default Redis connection is `redis://localhost:6379/0`. To use a different
server, set `REDIS_URL` before starting both Flask and the Celery worker:

```powershell
$env:REDIS_URL = 'redis://localhost:6379/0'
```

## Monthly admin activity report

Celery Beat queues the previous month's HTML activity report at **00:05 on the
first day of every month** (Asia/Kolkata). Run it in a third terminal:

```powershell
cd backend
..\venv\Scripts\celery.exe -A celery_app.celery beat --loglevel=info
```


cd backend
..\venv\Scripts\celery.exe -A celery_app.celery worker --loglevel=info --pool=solo

## Daily student deadline reminders

Celery Beat queues deadline reminders every day at **09:00 Asia/Kolkata**. Each
active, non-blacklisted student receives one email listing approved drives that
close within the next seven days and that they have not already applied to. The
admin dashboard's **Send Deadline Reminders Now** button queues the identical
job on demand and reports its delivery status.

Use the same SMTP configuration above. To change the reminder window, set this
environment variable before starting the Celery worker and Beat:

```powershell
$env:REMINDER_LOOKAHEAD_DAYS = '7'
```
