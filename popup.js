// 页面加载时恢复保存的数据
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['apiKey', 'aiPlatform', 'resumeText', 'resumeTextEn'], (data) => {
        if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;
        if (data.aiPlatform) document.getElementById('aiPlatform').value = data.aiPlatform;
        if (data.resumeText) document.getElementById('resumeText').value = data.resumeText;
        if (data.resumeTextEn) document.getElementById('resumeTextEn').value = data.resumeTextEn;
    });
});

// 保存基本配置
document.getElementById('saveBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const aiPlatform = document.getElementById('aiPlatform').value;
    const resumeText = document.getElementById('resumeText').value.trim();
    const resumeTextEn = document.getElementById('resumeTextEn').value.trim();
    
    if (!apiKey) {
        showStatus('请填写 API Key');
        return;
    }
    if (!resumeText && !resumeTextEn) {
        showStatus('中英文简历至少填写一份！');
        return;
    }
    
    chrome.storage.local.set({ apiKey, aiPlatform, resumeText, resumeTextEn }, () => {
        showStatus('✅ 简历配置已保存到本地', '#28a745');
    });
});

// 触发智能填充
document.getElementById('fillBtn').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const aiPlatform = document.getElementById('aiPlatform').value;
    const resumeText = document.getElementById('resumeText').value.trim();

    if (!apiKey) {
        showStatus('请先填写并保存 API Key！');
        return;
    }

    showStatus(`正在呼叫 ${aiPlatform.toUpperCase()}...`, '#007bff');
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { 
            action: "FILL_FORM", 
            apiKey: apiKey,
            aiPlatform: aiPlatform, // 把平台信息发送给 content.js
            resumeText: resumeText
        }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('请刷新网申页面后再试！');
                return;
            }
            if (response && response.status === 'success') {
                showStatus('✅ 填充指令已发送！', '#28a745');
            } else if (response && response.error) {
                showStatus('❌ 错误: ' + response.error);
            }
        });
    } catch (e) {
        showStatus('插件发生错误，请重试。');
    }
});

// ==========================================
// 经验数据 (CSV) 导入导出模块 (保持不变)
// ==========================================
document.getElementById('exportBtn').addEventListener('click', () => {
    chrome.storage.local.get(['accumulatedData'], (data) => {
        const accumulated = data.accumulatedData || {};
        const keys = Object.keys(accumulated);
        if (keys.length === 0) { showStatus('暂无累积经验可导出', '#f0ad4e'); return; }

        let csvContent = '\uFEFF'; 
        csvContent += '"表单字段/问题","所属模块(选填)","填入的答案"\n'; 

        for (const fullKey of keys) {
            let field = fullKey; let context = '';
            if (fullKey.includes('||')) {
                const parts = fullKey.split('||');
                context = parts[0]; field = parts.slice(1).join('||');
            }
            const safeField = field.replace(/"/g, '""'); 
            const safeContext = context.replace(/"/g, '""'); 
            const safeValue = accumulated[fullKey].replace(/"/g, '""');
            csvContent += `"${safeField}","${safeContext}","${safeValue}"\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `网申经验库_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showStatus(`✅ 成功导出 ${keys.length} 条经验！`, '#28a745');
    });
});

document.getElementById('importBtn').addEventListener('click', () => { document.getElementById('fileInput').click(); });

document.getElementById('fileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { parseAndSaveCSV(e.target.result); };
    reader.readAsText(file, 'utf-8'); 
    event.target.value = ''; 
});

function parseAndSaveCSV(csvText) {
    const rows = []; let currentRow = []; let currentCell = ''; let inQuotes = false;
    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        if (char === '"') {
            if (inQuotes && csvText[i + 1] === '"') { currentCell += '"'; i++; } else { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell); currentCell = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && csvText[i + 1] === '\n') i++;
            currentRow.push(currentCell); rows.push(currentRow); currentRow = []; currentCell = '';
        } else { currentCell += char; }
    }
    if (currentCell || currentRow.length > 0) { currentRow.push(currentCell); rows.push(currentRow); }

    const newData = {}; let addedCount = 0;
    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i];
        if (cols.length >= 2) {
            let field = cols[0].trim(); let context = ''; let val = '';
            if (cols.length >= 3) { context = cols[1].trim(); val = cols[2].trim(); } else { val = cols[1].trim(); }
            if (field && val) {
                const fullKey = context ? `${context}||${field}` : field;
                newData[fullKey] = val; addedCount++;
            }
        }
    }
    if (addedCount === 0) { showStatus('⚠️ 未在表格中找到有效数据', '#f0ad4e'); return; }

    chrome.storage.local.get(['accumulatedData'], (data) => {
        const existingData = data.accumulatedData || {};
        const mergedData = { ...existingData, ...newData };
        chrome.storage.local.set({ accumulatedData: mergedData }, () => {
            showStatus(`✅ 成功导入/更新了 ${addedCount} 条经验！`, '#28a745');
        });
    });
}

function showStatus(msg, color = '#d9534f') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = msg; statusEl.style.color = color;
    setTimeout(() => { statusEl.textContent = ''; }, 3500);
}