# Wait for server to start
Start-Sleep -Seconds 2

# Seed data
Write-Host "Seeding data..."
& curl.exe -X POST http://localhost:8787/api/admin/seed
Write-Host "`n"

# Get resources
Write-Host "Getting resources..."
& curl.exe http://localhost:8787/api/resources
Write-Host "`n"

# Create booking
Write-Host "Creating booking..."
& curl.exe -X POST http://localhost:8787/api/bookings -H "Content-Type: application/json" -d "{\`"resourceId\`": 1, \`"userId\`": \`"user1\`", \`"startTime\`": 1698400800, \`"endTime\`": 1698404400}"
Write-Host "`n"

# Try duplicate booking (should fail)
Write-Host "Attempting conflicting booking..."
& curl.exe -X POST http://localhost:8787/api/bookings -H "Content-Type: application/json" -d "{\`"resourceId\`": 1, \`"userId\`": \`"user2\`", \`"startTime\`": 1698402600, \`"endTime\`": 1698406200}"
Write-Host "`n"

# Get bookings
Write-Host "Getting bookings..."
& curl.exe http://localhost:8787/api/bookings
Write-Host "`n"

