#!/bin/bash

# MySQL Installation Script for macOS/Linux
# This script helps install MySQL if not already installed

echo "🔧 MySQL Installation Helper for Lumina"
echo "========================================"
echo ""

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "Detected: macOS"
    echo ""
    
    if command -v brew &> /dev/null; then
        echo "✅ Homebrew found"
        echo ""
        echo "Installing MySQL..."
        brew install mysql
        
        echo ""
        echo "Starting MySQL service..."
        brew services start mysql
        
        echo ""
        echo "✅ MySQL installed and started!"
        echo ""
        echo "Default credentials:"
        echo "  User: root"
        echo "  Password: (empty by default)"
        echo ""
        echo "To set a password, run:"
        echo "  mysql_secure_installation"
        echo ""
    else
        echo "❌ Homebrew not found!"
        echo ""
        echo "Please install Homebrew first:"
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        echo ""
        exit 1
    fi
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo "Detected: Linux"
    echo ""
    
    if command -v apt-get &> /dev/null; then
        # Debian/Ubuntu
        echo "Installing MySQL..."
        sudo apt-get update
        sudo apt-get install -y mysql-server mysql-client
        
        echo ""
        echo "Starting MySQL service..."
        sudo systemctl start mysql
        sudo systemctl enable mysql
        
        echo ""
        echo "✅ MySQL installed and started!"
        echo ""
        echo "To set root password, run:"
        echo "  sudo mysql_secure_installation"
        echo ""
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        echo "Installing MySQL..."
        sudo yum install -y mysql-server mysql
        
        echo ""
        echo "Starting MySQL service..."
        sudo systemctl start mysqld
        sudo systemctl enable mysqld
        
        echo ""
        echo "✅ MySQL installed and started!"
        echo ""
        echo "To set root password, run:"
        echo "  sudo mysql_secure_installation"
        echo ""
    else
        echo "❌ Unsupported Linux distribution!"
        echo "Please install MySQL manually:"
        echo "  https://dev.mysql.com/doc/refman/8.0/en/installing.html"
        exit 1
    fi
    
else
    echo "❌ Unsupported operating system: $OSTYPE"
    echo ""
    echo "Please install MySQL manually:"
    echo "  https://dev.mysql.com/downloads/mysql/"
    exit 1
fi

echo "Next steps:"
echo "1. Run: cd backend && npm run setup:mysql"
echo "2. Start the backend: npm run dev"
echo ""

