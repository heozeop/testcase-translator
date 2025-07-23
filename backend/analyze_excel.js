const XLSX = require('xlsx');
const fs = require('fs');

// Read the Excel file for the specific project
const projectId = '10939e1d-1e22-47de-9660-cecb7c01d77c';
const excelFiles = fs.readdirSync('uploads').filter(file => file.startsWith(projectId) && file.endsWith('.xlsx'));

console.log('Found Excel files for project:', excelFiles);

excelFiles.forEach(file => {
    console.log(`\n=== Analyzing ${file} ===`);
    const workbook = XLSX.read(fs.readFileSync(`uploads/${file}`), { type: 'buffer' });
    
    console.log('Sheet names:', workbook.SheetNames);
    
    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        console.log('Number of rows:', data.length);
        console.log('Sample data (first 3 rows):');
        data.slice(0, 3).forEach((row, index) => {
            console.log(`Row ${index + 1}:`, JSON.stringify(row, null, 2));
        });
        
        if (data.length > 0) {
            console.log('Column headers:', Object.keys(data[0]));
        }
    });
});