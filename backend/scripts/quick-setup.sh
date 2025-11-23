#!/bin/bash

# Quick MySQL Setup for Lumina
# This script will guide you through MySQL setup

echo "🚀 Lumina MySQL Quick Setup"
echo "============================"
echo ""

# Check OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="Linux"
else
    OS="Other"
fi

echo "Detected OS: $OS"
echo ""

# Check if MySQL is installed
if command -v mysql &> /dev/null; then
    echo "✅ MySQL client found"
    MYSQL_INSTALLED=true
else
    echo "❌ MySQL not found"
    MYSQL_INSTALLED=false
fi

# Check if MySQL server is running
if mysqladmin ping -h localhost --silent 2>/dev/null; then
    echo "✅ MySQL server is running"
    MYSQL_RUNNING=true
else
    echo "❌ MySQL server is not running"
    MYSQL_RUNNING=false
fi

echo ""

# Installation instructions
if [ "$MYSQL_INSTALLED" = false ]; then
    echo "📦 Installing MySQL..."
    echo ""
    
    if [ "$OS" = "macOS" ]; then
        if command -v brew &> /dev/null; then
            echo "Installing MySQL via Homebrew..."
            brew install mysql
            brew services start mysql
            echo "✅ MySQL installed and started!"
        else
            echo "Please install Homebrew first:"
            echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
            echo ""
            echo "Then run: brew install mysql && brew services start mysql"
            exit 1
        fi
    elif [ "$OS" = "Linux" ]; then
        if command -v apt-get &> /dev/null; then
            echo "Installing MySQL via apt-get..."
            sudo apt-get update
            sudo apt-get install -y mysql-server mysql-client
            sudo systemctl start mysql
            sudo systemctl enable mysql
            echo "✅ MySQL installed and started!"
        else
            echo "Please install MySQL manually for your Linux distribution"
            exit 1
        fi
    else
        echo "Please install MySQL manually:"
        echo "  https://dev.mysql.com/downloads/mysql/"
        exit 1
    fi
    
    echo ""
    sleep 2
fi

# Start MySQL if not running
if [ "$MYSQL_RUNNING" = false ]; then
    echo "🔄 Starting MySQL server..."
    
    if [ "$OS" = "macOS" ]; then
        brew services start mysql
    elif [ "$OS" = "Linux" ]; then
        sudo systemctl start mysql
    fi
    
    sleep 2
    
    if mysqladmin ping -h localhost --silent 2>/dev/null; then
        echo "✅ MySQL server started!"
    else
        echo "❌ Failed to start MySQL server"
        echo "Please start it manually and run this script again"
        exit 1
    fi
    echo ""
fi

# Create database
echo "📊 Creating database..."
mysql -u root -e "CREATE DATABASE IF NOT EXISTS lumina CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Database 'lumina' created!"
else
    # Try with password prompt
    echo "Please enter MySQL root password:"
    mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS lumina CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    
    if [ $? -eq 0 ]; then
        echo "✅ Database 'lumina' created!"
    else
        echo "❌ Failed to create database"
        exit 1
    fi
fi

echo ""

# Update .env file
echo "📝 Updating .env file..."
ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
    touch "$ENV_FILE"
fi

# Remove old MySQL config
sed -i.bak '/^MYSQL_/d' "$ENV_FILE" 2>/dev/null || sed -i '' '/^MYSQL_/d' "$ENV_FILE" 2>/dev/null

# Add MySQL config
echo "" >> "$ENV_FILE"
echo "# MySQL Configuration" >> "$ENV_FILE"
echo "MYSQL_HOST=localhost" >> "$ENV_FILE"
echo "MYSQL_PORT=3306" >> "$ENV_FILE"
echo "MYSQL_USER=root" >> "$ENV_FILE"
echo "MYSQL_PASSWORD=" >> "$ENV_FILE"
echo "MYSQL_DATABASE=lumina" >> "$ENV_FILE"

echo "✅ .env file updated!"
echo ""

echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. If you set a MySQL root password, update MYSQL_PASSWORD in backend/.env"
echo "2. Start the backend: cd backend && npm run dev"
echo ""

