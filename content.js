// 打印日志，方便用户按 F12 确认脚本是否成功注入
console.log("🚀 [AutoApply AI Pro] 脚本已注入！支持下拉框提取与上下文感知。");
console.log("💡 隐藏技巧：遇到假下拉框存不进题库？填好后【按住 Alt 键 + 鼠标左键点击】即可强行收录！");

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "FILL_FORM") {
        console.log("📥 收到智能填充指令，开始执行...");
        processAutoFill(request.apiKey, request.resumeText)
            .then(() => sendResponse({ status: 'success' }))
            .catch((err) => sendResponse({ error: err.message }));
        return true; 
    }
});

// 核心处理逻辑
async function processAutoFill(apiKey, resumeText) {
    const storageData = await chrome.storage.local.get(['accumulatedData', 'resumeTextEn']);
    const accumulatedData = storageData.accumulatedData || {};
    const resumeTextEn = storageData.resumeTextEn || '';

    // 1. 提取当前网页的表单信息
    const formFields = extractFormFields();
    if (formFields.length === 0) {
        throw new Error("页面上没有找到可填写的表单输入框。");
    }

    console.log(`🔍 扫描到 ${formFields.length} 个表单字段，准备呼叫 AI...`);

    // 为了防止 Token 爆炸，精简要发送的数据，但【保留上下文和选项】
    const cleanFieldsForAI = formFields.map(f => ({
        id: f.id,
        context: f.context,     // 【新增】所属的大模块标题 (如"教育经历1")
        label: f.label,
        name: f.name,
        type: f.type,
        placeholder: f.placeholder,
        options: f.options      // 【新增】下拉框的具体选项
    }));

    // 2. 调用 Kimi API
    const matchedData = await callKimiAPI(apiKey, resumeText, resumeTextEn, accumulatedData, cleanFieldsForAI);

    // 3. 将 AI 返回的数据填入网页
    fillDataIntoForm(matchedData, formFields);

    // 4. 开启常规监听
    trackManualInputsForAccumulation(formFields);
}

// ==========================================
// 核心升级一：寻找元素的“所属模块”上下文
// ==========================================
function findContextForElement(el) {
    let node = el;
    // 向上寻找最多 6 层父级
    for (let i = 0; i < 6; i++) {
        if (!node || node === document.body) break;
        // 查找当前父级之前的兄弟元素，看有没有标题 (H1-H6)
        let prev = node.previousElementSibling;
        while (prev) {
            if (/^H[1-6]$/i.test(prev.tagName) || (prev.className && typeof prev.className === 'string' && /title|header|section/i.test(prev.className))) {
                const text = prev.innerText.trim();
                // 找到合理的短标题就返回
                if (text && text.length > 0 && text.length < 40) return text;
            }
            prev = prev.previousElementSibling;
        }
        node = node.parentElement;
    }
    return ''; // 没找到则返回空
}

// 提取网页表单元素 (增强了 Context 和 Options 的提取)
function extractFormFields() {
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="radio"]):not([type="checkbox"]), textarea, select'));
    const fields = [];

    inputs.forEach((input, index) => {
        const style = window.getComputedStyle(input);
        if (style.display === 'none' || style.visibility === 'hidden' || input.disabled || input.readOnly || input.type === 'hidden') return;

        let labelText = '';

        if (input.getAttribute('aria-label')) labelText = input.getAttribute('aria-label').trim();
        
        if (!labelText && input.id) {
            const labelEl = document.querySelector(`label[for="${input.id}"]`);
            if (labelEl) labelText = labelEl.innerText.trim();
        }

        if (!labelText) {
            const wrapperLabel = input.closest('label');
            if (wrapperLabel) labelText = wrapperLabel.innerText.replace(input.value || '', '').trim();
        }

        if (!labelText && input.parentElement) {
            const parentText = input.parentElement.innerText.trim();
            if (parentText && parentText.length > 0 && parentText.length < 50) {
                labelText = parentText;
            } else {
                const prevNode = input.previousElementSibling;
                if (prevNode && prevNode.innerText && prevNode.innerText.length < 50) labelText = prevNode.innerText.trim();
            }
        }

        const nameAttr = input.name || '';
        const placeholder = input.placeholder || '';

        if (!labelText && !nameAttr && !placeholder) return;

        // 【新增】寻找上下文模块
        const contextText = findContextForElement(input);

        // 【新增】如果是下拉框，提取所有的可选文本
        let optionsArray = undefined;
        if (input.tagName.toLowerCase() === 'select') {
            optionsArray = Array.from(input.options)
                                .map(opt => opt.text.trim())
                                .filter(t => t !== '' && t !== '请选择' && t !== 'Select');
        }

        const tempId = input.id || `auto-field-${index}-${Math.random().toString(36).substr(2, 5)}`;
        input.setAttribute('data-auto-id', tempId);

        fields.push({
            id: tempId,
            element: input,
            context: contextText,
            label: labelText || '无明确标签',
            name: nameAttr,
            type: input.tagName.toLowerCase() === 'select' ? 'select' : (input.type || 'text'),
            placeholder: placeholder,
            options: optionsArray // 发给AI做单选题
        });
    });

    return fields;
}

// 调用 Moonshot (Kimi) API (更新了对下拉选项的强制要求)
async function callKimiAPI(apiKey, resumeText, resumeTextEn, accumulatedData, formFields) {
    console.log("🤖 正在呼叫 Kimi 思考匹配方案...");

    const prompt = `
你是一个顶级的智能网申填表助手。
以下是用户的中文简历：
"""
${resumeText}
"""

以下是用户的英文简历（可能为空）：
"""
${resumeTextEn}
"""

以下是用户历史累积的网申档案题库 (复合键名为 "模块||字段名" 或 "字段名")：
"""
${JSON.stringify(accumulatedData)}
"""

以下是当前网页需要填写的表单字段列表(JSON格式，可能包含所属的 context 模块名)：
${JSON.stringify(formFields)}

请为这些表单字段分配合适的值。核心规则：
1. 优先使用题库和简历。结合字段的 context（如"教育经历1"）和题库中的复合键名进行精准匹配。没有对应信息保留空字符串。
2. 智能判断语言：英文表单填英文，中文表单填中文。
3. ⚠️【绝对禁令】：如果字段数据中包含了 "options" 数组，说明这是一个下拉单选框。你填入的值【必须且只能】完全复制 "options" 数组中的某一个字符串，绝对不允许自己编造、改写或翻译不在数组里的词！
4. 必须严格返回纯 JSON 对象，Key为 "id"，Value 为填入值。格式如: {"auto-field-1": "Bachelor", "auto-field-2": "张三"}
`;

    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "moonshot-v1-8k",
            messages: [
                { role: "system", content: "你是一个只输出标准JSON的机器，绝不输出任何多余字符。" },
                { role: "user", content: prompt }
            ],
            temperature: 0.1 
        })
    });

    if (!response.ok) {
        let detailMsg = response.statusText;
        try {
            const errorData = await response.json();
            if (errorData.error && errorData.error.type === 'invalid_authentication_error') {
                detailMsg = "API Key 无效！请去Kimi开发者后台重新生成一个正确的Key。";
            } else {
                detailMsg = errorData.error?.message || JSON.stringify(errorData);
            }
        } catch (e) {}
        throw new Error(`Kimi 拒绝访问：${detailMsg}`);
    }

    const data = await response.json();
    let resultText = data.choices[0].message.content.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    try {
        const parsedData = JSON.parse(resultText);
        console.log("✅ AI 匹配完成:", parsedData);
        return parsedData;
    } catch (e) {
        throw new Error("AI 返回格式错误，请重试。");
    }
}

function setNativeValue(element, value) {
    element.focus();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    
    if (element.tagName === 'INPUT' && nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
    } else if (element.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
        nativeTextAreaValueSetter.call(element, value);
    } else {
        element.value = value;
    }
    
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.blur(); 
}

function fillDataIntoForm(matchResult, formFields) {
    let fillCount = 0;
    for (const field of formFields) {
        const valueToFill = matchResult[field.id];
        if (valueToFill && valueToFill.trim() !== "") {
            const el = document.querySelector(`[data-auto-id="${field.id}"]`);
            if (el) {
                try {
                    if (field.type === 'select') {
                        const options = Array.from(el.options);
                        const matchedOption = options.find(opt => 
                            opt.text.toLowerCase() === valueToFill.toLowerCase() || 
                            opt.value.toLowerCase() === valueToFill.toLowerCase() ||
                            opt.text.includes(valueToFill)
                        );
                        if (matchedOption) {
                            el.value = matchedOption.value;
                            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                            fillCount++;
                        }
                    } else {
                        setNativeValue(el, valueToFill);
                        fillCount++;
                    }

                    // 闪烁绿光提示
                    const originalBg = el.style.backgroundColor;
                    el.style.transition = 'background-color 0.5s ease';
                    el.style.backgroundColor = '#d4edda';
                    setTimeout(() => { el.style.backgroundColor = originalBg; }, 1500);
                } catch (e) { }
            }
        }
    }
    console.log(`🎉 智能填充完毕，共成功填入 ${fillCount} 个字段！`);
}

// 常规：监听标准输入框的输入
function trackManualInputsForAccumulation(formFields) {
    formFields.forEach(field => {
        const el = document.querySelector(`[data-auto-id="${field.id}"]`);
        if (!el) return;

        const saveInput = async (e) => {
            // 如果是下拉框，优先取用户看到的文本 (text)，而不是背后乱码的 value
            let val = '';
            if (el.tagName === 'SELECT' && el.selectedIndex >= 0) {
                val = el.options[el.selectedIndex].text;
            } else {
                val = e.target.value; 
            }

            if (val && val.trim() !== '' && val !== '请选择' && val !== 'Select') {
                const semanticKey = field.label !== '无明确标签' ? field.label : (field.name || field.placeholder || field.id);
                if (semanticKey.length > 50) return; 

                // 【核心升级】拼接所属模块上下文
                const fullKey = field.context ? `${field.context}||${semanticKey}` : semanticKey;

                const data = await chrome.storage.local.get(['accumulatedData']);
                const accumulated = data.accumulatedData || {};
                
                if (accumulated[fullKey] !== val.trim()) {
                    accumulated[fullKey] = val.trim();
                    await chrome.storage.local.set({ accumulatedData: accumulated });
                    console.log(`📚 [学习模式] 常规收录: ${fullKey} = ${val.trim()}`);
                }
            }
        };

        el.addEventListener('blur', saveInput);
        el.addEventListener('change', saveInput);
    });
}

// ==========================================
// 核心升级二：Alt+点击 霸王硬上弓模式 (抓取假下拉框)
// ==========================================
document.addEventListener('click', async (e) => {
    // 只有按住 Alt 键时左键点击才触发
    if (!e.altKey) return; 
    
    e.preventDefault();
    e.stopPropagation();
    
    const el = e.target;
    let val = '';
    
    // 智能提取该元素的值（针对 input 或者是普通的 div 假下拉框）
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        val = el.value;
    } else {
        val = el.innerText;
    }
    
    val = val ? val.trim() : '';
    if (!val || val.length > 100) {
        showToast('⚠️ 提取的内容为空或过长，请点准确切的文字');
        return;
    }

    // 尝试寻找上下文和字段名
    const context = findContextForElement(el);
    let name = el.getAttribute('aria-label') || '未知强制字段';
    
    if (name === '未知强制字段') {
        // 如果是 div，尝试找它上面的描述文字
        const sibling = el.previousElementSibling || el.parentElement?.previousElementSibling;
        if (sibling && sibling.innerText && sibling.innerText.trim().length < 30) {
            name = sibling.innerText.trim();
        }
    }
    
    const fullKey = context ? `${context}||${name}` : name;
    
    // 存入沙盒
    const data = await chrome.storage.local.get(['accumulatedData']);
    const accumulated = data.accumulatedData || {};
    accumulated[fullKey] = val;
    await chrome.storage.local.set({ accumulatedData: accumulated });
    
    showToast(`📚 强行记录成功：\n[${fullKey}] = ${val}`);
    console.log(`🔨 [Alt强行记录] 存入本地: ${fullKey} = ${val}`);
    
    // 视觉反馈
    const originalBg = el.style.backgroundColor;
    el.style.backgroundColor = '#d4edda';
    setTimeout(() => { el.style.backgroundColor = originalBg; }, 1000);
}, { capture: true }); // 使用捕获阶段，防止被 React 拦截

// 页面右下角的小巧提示框
function showToast(msg) {
    const toast = document.createElement('div');
    toast.innerText = msg;
    toast.style.cssText = `
        position: fixed; bottom: 30px; right: 30px; background: #28a745; color: white; 
        padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 2147483647; font-family: sans-serif; font-size: 14px; font-weight: bold;
        transition: opacity 0.4s ease-out; white-space: pre-line; pointer-events: none;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { 
        toast.style.opacity = '0'; 
        setTimeout(() => toast.remove(), 400); 
    }, 3500);
}
