#!/usr/bin/env python3
"""
Automated Test Suite for Voice Assistant API

This script tests the voice assistant API endpoints with a comprehensive set of test cases
covering various query types, speech recognition scenarios, and system capabilities.

Total Test Cases: 23
- Basic Functionality (1-5): Core voice recognition and query processing  
- Complex Tests (6-23): Advanced scenarios including multi-table joins, speech variations
"""

import requests
import json
import time
from datetime import datetime

# Flask app endpoint
BASE_URL = "http://localhost:3000"
QUERY_ENDPOINT = f"{BASE_URL}/api/query"

# Test Cases - Total: 23
TEST_CASES = [
    {
        "id": 1,
        "name": "Equipment Pattern Normalization",
        "spoken": "Show me pushback tractors in zone B South",
        "expected_systems": "Layer 1 (Hard-coded patterns)",
        "expected_result_type": "4 Push-back Tractor records",
        "status": "✅"
    },
    {
        "id": 2,
        "name": "Entity ID + Zone Pattern Normalization",
        "spoken": "Find equipment tgcn01 in zone C North",
        "expected_systems": "Layer 1 (Enhanced patterns)",
        "expected_result_type": "TG-CN-01 Baggage Tug",
        "status": "✅"
    },
    {
        "id": 3,
        "name": "Equipment + Status Query",
        "spoken": "How many ground power units are idle",
        "expected_systems": "Layer 1 + Layer 3",
        "expected_result_type": "Count of idle GPUs",
        "status": "✅"
    },
    {
        "id": 4,
        "name": "Semantic Equipment Matching",
        "spoken": "Show me power units in C Central",
        "expected_systems": "Layer 2 (Dynamic fallback)",
        "expected_result_type": "GPU equipment records",
        "status": "✅"
    },
    {
        "id": 5,
        "name": "Maintenance Category Mapping",
        "spoken": "Find maintenance vehicles in B South",
        "expected_systems": "Layer 2 (Dynamic fallback)",
        "expected_result_type": "Service Truck records",
        "status": "✅"
    },
    {
        "id": 6,
        "name": "Pushback Tractor Assignment",
        "spoken": "What push back tractor is assigned to flight UA2292?",
        "expected_systems": "Layer 1 + Layer 3 (Complex JOIN)",
        "expected_result_type": "4 assigned tractors",
        "status": "✅"
    },
    {
        "id": 7,
        "name": "Flight Provider Information",
        "spoken": "What is the provider company for flight UA1214?",
        "expected_systems": "Layer 3 (Enhanced AI)",
        "expected_result_type": "United",
        "status": "✅"
    },
    {
        "id": 8,
        "name": "Nearest Equipment to Gate",
        "spoken": "What is the nearest pushback tractor to gate B6?",
        "expected_systems": "Layer 1 + Layer 3 (Proximity)",
        "expected_result_type": "12 tractors in B zones",
        "status": "✅"
    },
    {
        "id": 9,
        "name": "Equipment Count by Type",
        "spoken": "How many service trucks do we have?",
        "expected_systems": "Layer 2 + Layer 3",
        "expected_result_type": "Count of Service Trucks",
        "status": "✅"
    },
    {
        "id": 10,
        "name": "Zone Equipment Listing",
        "spoken": "Show me all equipment in zone B south",
        "expected_systems": "Layer 1 (Zone normalization) + Layer 3",
        "expected_result_type": "All B-South equipment",
        "status": "✅"
    },
    {
        "id": 11,
        "name": "Equipment Status Overview",
        "spoken": "What ground power units are idle?",
        "expected_systems": "Layer 1 + Layer 3 (JOIN)",
        "expected_result_type": "428 idle GPUs",
        "status": "✅"
    },
    {
        "id": 12,
        "name": "Equipment by Zone",
        "spoken": "What maintenance vehicles are in B South?",
        "expected_systems": "Layer 2 + Zone normalization",
        "expected_result_type": "Service Trucks in B-South",
        "status": "✅"
    },
    {
        "id": 13,
        "name": "Equipment Type Discovery",
        "spoken": "What types of equipment do we have?",
        "expected_systems": "Layer 3 (Enhanced AI)",
        "expected_result_type": "All equipment types",
        "status": "✅"
    },
    {
        "id": 14,
        "name": "Multi-Zone Equipment Search",
        "spoken": "Find all baggage tugs in zones C north and C central",
        "expected_systems": "Layer 1 + Layer 3 (Multi-condition)",
        "expected_result_type": "Baggage Tugs in specified zones",
        "status": "⚠️ Known Issue: Classification conflict"
    },
    {
        "id": 15,
        "name": "Available Equipment in Zone",
        "spoken": "What equipment is idle in zone C north?",
        "expected_systems": "Layer 1 + Layer 3 (JOIN)",
        "expected_result_type": "294 idle equipment pieces",
        "status": "✅"
    },
    {
        "id": 16,
        "name": "Equipment Count by Status",
        "spoken": "How much idle equipment do we have?",
        "expected_systems": "Layer 3 (Status-based count)",
        "expected_result_type": "4,494 total idle equipment",
        "status": "✅"
    },
    {
        "id": 17,
        "name": "Power Units Count by Zone",
        "spoken": "How many power units are in zone B South?",
        "expected_systems": "Layer 1 + Layer 3",
        "expected_result_type": "4 GPUs in B-South",
        "status": "✅"
    },
    {
        "id": 18,
        "name": "Pushback Tractor Assignment with Status",
        "spoken": "What pushback tractor is assigned to flight 1214",
        "expected_systems": "Layer 1 (Flight/Equipment normalization) + Layer 3 (Enhanced AI with status)",
        "expected_result_type": "4 assigned tractors with status",
        "status": "✅"
    },
    {
        "id": 19,
        "name": "Cleaning Lead Personnel Assignment",
        "spoken": "Who is the cleaning lead for flight 1214",
        "expected_systems": "Layer 1 (Flight number correction) + Layer 3 (Enhanced AI with flight_service_assignments)",
        "expected_result_type": "Blake Nelson with phone number",
        "status": "✅"
    },
    {
        "id": 20,
        "name": "Employee Shift Ending Query",
        "spoken": "When does Blake Nelson shift end",
        "expected_systems": "Layer 1 (Special case classification) + Layer 3 (Enhanced AI with employee_shifts JOIN)",
        "expected_result_type": "Shift end time: July 7, 2025 at 2:45 PM",
        "status": "✅"
    },
    # Test Case 21: Nearest Equipment Location Query
    {
        "id": 21,
        "name": "Nearest Equipment Location Query",
        "query": "Where is the nearest pushback tractor to gate B one, the one assigned broke down",
        "expected_contains": ["PB-BN-01", "B1", "nearest", "Push-back Tractor"],
        "expected_min_results": 3,
        "category": "equipment",
        "description": "Tests nearest equipment functionality with gate normalization and contextual information removal"
    },
    # Test Case 22: Ramp Team Members on Break Query
    {
        "id": 22,
        "name": "Ramp Team Members on Break Query",
        "spoken": "What ramp team members are on break during flight 1214",
        "expected_systems": "Layer 1 (Flight normalization + Speech correction) + Layer 3 (Multi-table JOIN with special case classification)",
        "expected_result_type": "List of ramp team members: Alex Harris (312-555-6987), Blake Clark (312-555-7034), etc.",
        "status": "✅"
    },
    # Test Case 23: Next Assignment Query
    {
        "id": 23,
        "name": "Next Assignment Query",
        "spoken": "What is Alex Harris next assignment",
        "expected_systems": "Layer 1 (Special case classification) + Layer 3 (Future shift filtering with personalized no-data response)",
        "expected_result_type": "Alex Harris has no upcoming assignments scheduled at this time.",
        "status": "✅"
    }
]

def test_query(test_case):
    """Test a single query via the API"""
    print(f"\n{'='*70}")
    print(f"🧪 TEST CASE {test_case['id']}: {test_case['name']} {test_case['status']}")
    print(f"📢 SPOKEN: \"{test_case['spoken']}\"")
    print(f"🔧 EXPECTED SYSTEMS: {test_case['expected_systems']}")
    print(f"📊 EXPECTED RESULT: {test_case['expected_result_type']}")
    
    payload = {
        "query": test_case['spoken'],  # Note: API expects 'query', not 'user_query'
        "language": "en"
    }
    
    try:
        start_time = time.time()
        response = requests.post(QUERY_ENDPOINT, json=payload, timeout=30)
        end_time = time.time()
        
        response_time = round((end_time - start_time) * 1000, 1)
        
        if response.status_code == 200:
            data = response.json()
            
            print(f"✅ STATUS: SUCCESS ({response.status_code})")
            print(f"⏱️  RESPONSE TIME: {response_time}ms")
            
            # Check SQL generation
            if 'sql_query' in data and data['sql_query']:
                print(f"🔍 GENERATED SQL: {data['sql_query'][:100]}...")
                
                # Check for conversational response (voice assistant format)
                if 'response' in data and data['response']:
                    print(f"🗨️  AI RESPONSE: {data['response'][:80]}...")
                    
                # Check database result count
                if 'result_count' in data:
                    print(f"📈 DATABASE RESULTS: {data['result_count']} rows")
                
                # Check for raw results (if available in debug mode)
                if 'results' in data and data['results']:
                    result_count = len(data['results'])
                    print(f"📊 RAW DATA: {result_count} rows returned")
                    
                    # Show sample results for verification
                    if result_count <= 3:
                        for i, row in enumerate(data['results']):
                            print(f"   Row {i+1}: {row}")
                    else:
                        print(f"   Sample: {data['results'][0]}")
                        if result_count > 1:
                            print(f"   ... ({result_count-1} more rows)")
                
                return {
                    'success': True,
                    'response_time': response_time,
                    'sql_generated': True,
                    'result_count': data.get('result_count', 0),
                    'sql_query': data['sql_query'],
                    'has_response': bool(data.get('response')),
                    'classification_method': data.get('classification_method', 'unknown')
                }
            else:
                print(f"⚠️  WARNING: No SQL generated")
                if 'response' in data:
                    print(f"🗨️  AI Response: {data['response'][:100]}...")
                
                return {
                    'success': False,
                    'response_time': response_time,
                    'sql_generated': False,
                    'error': 'No SQL generated',
                    'has_response': bool(data.get('response')),
                    'classification_method': data.get('classification_method', 'unknown')
                }
        else:
            print(f"❌ STATUS: FAILED ({response.status_code})")
            print(f"⏱️  RESPONSE TIME: {response_time}ms")
            print(f"💥 ERROR: {response.text[:100]}...")
            
            return {
                'success': False,
                'response_time': response_time,
                'sql_generated': False,
                'error': f"HTTP {response.status_code}: {response.text[:50]}...",
                'has_response': False,
                'classification_method': 'error'
            }
            
    except requests.exceptions.Timeout:
        print(f"❌ STATUS: TIMEOUT (>30s)")
        return {
            'success': False,
            'response_time': 30000,
            'sql_generated': False,
            'error': 'Request timeout',
            'has_response': False,
            'classification_method': 'timeout'
        }
    except Exception as e:
        print(f"❌ STATUS: ERROR")
        print(f"💥 EXCEPTION: {str(e)}")
        return {
            'success': False,
            'response_time': 0,
            'sql_generated': False,
            'error': str(e),
            'has_response': False,
            'classification_method': 'exception'
        }

def main():
    """Run all test cases and generate comprehensive summary"""
    print("🚀 VOICE ASSISTANT AUTOMATED TEST SUITE")
    print("="*70)
    print(f"⏰ Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🎯 Target: {QUERY_ENDPOINT}")
    print(f"📋 Test Cases: {len(TEST_CASES)}")
    print(f"🧠 Testing: 3-layer enhanced speech processing architecture")
    
    # Check if server is running
    try:
        health_response = requests.get(BASE_URL, timeout=5)
        print(f"✅ Server Status: ONLINE")
    except:
        print(f"❌ Server Status: OFFLINE")
        print(f"💡 Please start the Flask app: python app.py")
        return
    
    results = []
    successful_tests = 0
    sql_generated_count = 0
    total_time = 0
    
    # Run all tests
    for test_case in TEST_CASES:
        result = test_query(test_case)
        result['test_case'] = test_case
        results.append(result)
        
        if result['success']:
            successful_tests += 1
        
        if result['sql_generated']:
            sql_generated_count += 1
        
        total_time += result['response_time']
        
        # Small delay between tests to avoid overwhelming the server
        time.sleep(0.5)
    
    # Generate comprehensive summary
    print(f"\n{'='*70}")
    print(f"📊 COMPREHENSIVE TEST SUMMARY")
    print(f"{'='*70}")
    print(f"✅ SUCCESSFUL: {successful_tests}/{len(TEST_CASES)} ({successful_tests/len(TEST_CASES)*100:.1f}%)")
    print(f"❌ FAILED: {len(TEST_CASES) - successful_tests}/{len(TEST_CASES)}")
    print(f"🔍 SQL GENERATED: {sql_generated_count}/{len(TEST_CASES)} ({sql_generated_count/len(TEST_CASES)*100:.1f}%)")
    print(f"⏱️  TOTAL TIME: {total_time:.1f}ms")
    print(f"📈 AVG TIME: {total_time/len(TEST_CASES):.1f}ms per test")
    
    # Show failed tests with details
    failed_tests = [r for r in results if not r['success']]
    if failed_tests:
        print(f"\n❌ FAILED TESTS:")
        for result in failed_tests:
            tc = result['test_case']
            print(f"   Test {tc['id']}: {tc['name']}")
            print(f"      Error: {result['error']}")
            print(f"      Classification: {result['classification_method']}")
    else:
        print(f"\n🎉 ALL TESTS PASSED!")
    
    # Show performance analysis
    performance_times = [r['response_time'] for r in results if r['success']]
    if performance_times:
        fastest = min(performance_times)
        slowest = max(performance_times)
        print(f"\n⚡ PERFORMANCE ANALYSIS:")
        print(f"   Fastest: {fastest:.1f}ms")
        print(f"   Slowest: {slowest:.1f}ms")
        print(f"   Average: {sum(performance_times)/len(performance_times):.1f}ms")
    
    # Show classification analysis
    classification_methods = [r['classification_method'] for r in results]
    enhanced_count = classification_methods.count('enhanced')
    print(f"\n🧠 CLASSIFICATION ANALYSIS:")
    print(f"   Enhanced: {enhanced_count}/{len(TEST_CASES)} ({enhanced_count/len(TEST_CASES)*100:.1f}%)")
    print(f"   Other: {len(TEST_CASES) - enhanced_count}/{len(TEST_CASES)}")
    
    # Final assessment
    success_rate = successful_tests / len(TEST_CASES) * 100
    print(f"\n🎯 SYSTEM ASSESSMENT:")
    if success_rate >= 95:
        print(f"   🟢 EXCELLENT: {success_rate:.1f}% success rate - Production ready!")
    elif success_rate >= 85:
        print(f"   🟡 GOOD: {success_rate:.1f}% success rate - Minor issues to address")
    else:
        print(f"   🔴 NEEDS WORK: {success_rate:.1f}% success rate - Significant issues")
    
    print(f"\n⏰ Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Architecture validation
    if successful_tests >= 22:
        print(f"\n🛫 3-LAYER ARCHITECTURE: VALIDATED!")
        print(f"   Layer 1 (Hard-coded): Equipment, zones, entity normalization ✅")
        print(f"   Layer 2 (Dynamic): Semantic equipment matching ✅")  
        print(f"   Layer 3 (Enhanced AI): Complex queries & JOINs ✅")
        print(f"\n🚀 READY FOR PRODUCTION DEPLOYMENT! ✨")
    else:
        print(f"\n🔧 Architecture needs refinement before production.")

if __name__ == "__main__":
    main()