#!/usr/bin/env node

/**
 * MySQL Setup Script
 * Automatically sets up MySQL database for Lumina
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_NAME = process.env.MYSQL_DATABASE || 'lumina';
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASSWORD = process.env.MYSQL_PASSWORD || '';
const DB_HOST = process.env.MYSQL_HOST || 'localhost';
const DB_PORT = process.env.MYSQL_PORT || '3306';

console.log('🔧 Setting up MySQL for Lumina...\n');

// Check if mysql command is available
function checkMySQLInstalled() {
  try {
    execSync('which mysql', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// Check if MySQL server is running
function checkMySQLRunning() {
  try {
    execSync(`mysqladmin ping -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} ${DB_PASSWORD ? `-p${DB_PASSWORD}` : ''}`, { 
      stdio: 'ignore',
      timeout: 5000 
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Create database
function createDatabase() {
  try {
    const passwordFlag = DB_PASSWORD ? `-p${DB_PASSWORD}` : '';
    execSync(
      `mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} ${passwordFlag} -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`,
      { stdio: 'inherit' }
    );
    console.log(`✅ Database '${DB_NAME}' created or already exists\n`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to create database: ${error.message}\n`);
    return false;
  }
}

// Update .env file with MySQL configuration
function updateEnvFile() {
  const envPath = path.join(__dirname, '../.env');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  // Remove old MySQL config if exists
  envContent = envContent.replace(/MYSQL_.*\n/g, '');
  
  // Add MySQL configuration
  envContent += `\n# MySQL Configuration\n`;
  envContent += `MYSQL_HOST=${DB_HOST}\n`;
  envContent += `MYSQL_PORT=${DB_PORT}\n`;
  envContent += `MYSQL_USER=${DB_USER}\n`;
  envContent += `MYSQL_PASSWORD=${DB_PASSWORD}\n`;
  envContent += `MYSQL_DATABASE=${DB_NAME}\n`;
  
  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Updated .env file with MySQL configuration\n`);
}

// Main setup function
async function setup() {
  console.log('Checking MySQL installation...');
  
  if (!checkMySQLInstalled()) {
    console.error('❌ MySQL client not found!\n');
    console.log('Please install MySQL:');
    console.log('  macOS: brew install mysql');
    console.log('  Ubuntu/Debian: sudo apt-get install mysql-server mysql-client');
    console.log('  Windows: Download from https://dev.mysql.com/downloads/mysql/\n');
    process.exit(1);
  }
  
  console.log('✅ MySQL client found\n');
  
  console.log('Checking MySQL server connection...');
  if (!checkMySQLRunning()) {
    console.error('❌ Cannot connect to MySQL server!\n');
    console.log('Please ensure MySQL server is running:');
    console.log('  macOS: brew services start mysql');
    console.log('  Ubuntu/Debian: sudo systemctl start mysql');
    console.log('  Windows: Start MySQL service from Services panel\n');
    console.log('Or set these environment variables:');
    console.log(`  MYSQL_HOST=${DB_HOST}`);
    console.log(`  MYSQL_PORT=${DB_PORT}`);
    console.log(`  MYSQL_USER=${DB_USER}`);
    console.log(`  MYSQL_PASSWORD=${DB_PASSWORD ? '***' : '(empty)'}\n`);
    process.exit(1);
  }
  
  console.log('✅ MySQL server is running\n');
  
  console.log(`Creating database '${DB_NAME}'...`);
  if (!createDatabase()) {
    process.exit(1);
  }
  
  console.log('Updating .env file...');
  updateEnvFile();
  
  console.log('🎉 MySQL setup complete!\n');
  console.log('You can now start the backend with: npm run dev');
}

setup().catch(error => {
  console.error('Setup failed:', error);
  process.exit(1);
});

