#!/bin/bash

# Airport Operations Voice Assistant Setup Script
# Built for Frontier AI Challenge

echo "🛫 Setting up JARVIS - Airport Operations Voice Assistant"
echo "================================================="

# Check Python version
python_version=$(python3 --version 2>&1)
if [[ $? -eq 0 ]]; then
    echo "✅ Python found: $python_version"
else
    echo "❌ Python 3 is required. Please install Python 3.8+ and try again."
    exit 1
fi

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

if [[ $? -ne 0 ]]; then
    echo "❌ Failed to install dependencies. Please check your pip configuration."
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Check for database
if [[ ! -f "united_airlines_normalized.db" ]]; then
    echo "📊 Creating sample database..."
    python create_sample_db.py
    echo "✅ Sample database created"
else
    echo "✅ Database file found"
fi

# Check for .env file
if [[ ! -f ".env" ]]; then
    echo "⚙️  Creating environment configuration..."
    echo "# Airport Operations Voice Assistant Configuration" > .env
    echo "OPENAI_API_KEY=your_openai_api_key_here" >> .env
    echo "FLASK_DEBUG=True" >> .env
    echo "DATABASE_PATH=united_airlines_normalized.db" >> .env
    echo "CONFIDENCE_THRESHOLD=0.7" >> .env
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env and add your OpenAI API key!"
    echo "   You can get an API key from: https://platform.openai.com/api-keys"
    echo ""
else
    echo "✅ Environment configuration found"
fi

echo ""
echo "🎯 Setup Complete! Next steps:"
echo "1. Edit .env file and add your OpenAI API key"
echo "2. Run: python app.py"
echo "3. Open browser to: http://localhost:3000"
echo "4. Click 'Start Voice Assistant'"
echo "5. Say 'Jarvis' followed by your question"
echo ""
echo "📝 Sample queries to try:"
echo "   - 'Jarvis, what is the status of flight UA2406?'"
echo "   - 'Hey Jarvis, what pushback tractor is assigned to flight UA2406?'"
echo "   - 'Jarvis, who is the cleaning lead on flight UA2406?'"
echo "   - 'Hey Jarvis, what ramp team members are on break now?'"
echo ""
echo "📞 Need API credits? Contact Peter Moeckel:"
echo "   📧 pmoeckel@frontieraudio.com"
echo "   📱 860-305-5521"
echo ""
echo "🚀 Ready to revolutionize airport operations!" 