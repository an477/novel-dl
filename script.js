// =======================================================================
// [핵심 우회 카드] 브라우저 원천 API 가로채기 (Shadow DOM Lock-Open Hook)
// 사이트가 closed 섀도 돔을 만들려고 할 때 강제로 open으로 변경하여 방어막을 무력화합니다.
// =======================================================================
if (!Element.prototype._attachShadow) {
    Element.prototype._attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
        if (options && options.mode === 'closed') {
            options.mode = 'open'; 
        }
        return this._attachShadow(options);
    };
}

async function fetchNovelContent(url) {
    return new Promise((resolve) => {
        // 1. 세션 쿠키와 토큰 처리를 정상 유저와 동일하게 타기 위해 실제 팝업 창 오픈
        const popup = window.open(url, '_blank', 'width=800,height=600,noopener=false,noreferrer=false');
        
        if (!popup) {
            alert("Popup blocker is active! Please allow popups for this site to download.");
            resolve(null);
            return;
        }

        let checkAttempts = 0;
        const maxAttempts = 50; // 최대 10초 대기
        
        const timer = setInterval(() => {
            checkAttempts++;
            try {
                const popupDoc = popup.document;
                
                // 훅(Hook) 메커니즘에 의해 open 상태로 풀려버린 섀도 돔 호스트 엘리먼트 추적
                const shadowHost = popupDoc.querySelector('.novel-viewer div[style*="font-size"]');
                
                // Next.js 동적 텍스트가 바인딩 완료되어 "불러오는 중..." 문구가 완전히 지워졌을 때 추출 개시
                if (shadowHost && !popupDoc.body.innerText.includes("불러오는 중")) {
                    
                    let pureBodyText = '';
                    
                    // [정밀 조준] 잠금 해제된 섀도 루트(shadowRoot) 혹은 내부 template 노드 내부 진입
                    // 어떤 타이밍이든 무조건 알맹이 <p> 태그 텍스트 스트림을 직접 낚아챕니다.
                    const shadowRoot = shadowHost.shadowRoot;
                    const templateElem = shadowHost.querySelector('template');
                    
                    if (shadowRoot) {
                        const paragraphs = Array.from(shadowRoot.querySelectorAll('p'));
                        pureBodyText = paragraphs.map(p => p.textContent.trim()).filter(Boolean).join('\n\n');
                    } else if (templateElem && templateElem.content) {
                        const paragraphs = Array.from(templateElem.content.querySelectorAll('p'));
                        pureBodyText = paragraphs.map(p => p.textContent.trim()).filter(Boolean).join('\n\n');
                    } else {
                        // 백업 파싱: 가상 문자열 버퍼에서 <p> 태그 알맹이만 직접 추출
                        const innerHTML = shadowHost.innerHTML;
                        const match = innerHTML.match(/<template[^>]*>([\s\S]*?)<\/template>/);
                        const targetHtml = match ? match[1] : innerHTML;
                        const virtualDoc = new DOMParser().parseFromString(targetHtml, 'text/html');
                        const paragraphs = Array.from(virtualDoc.querySelectorAll('p'));
                        pureBodyText = paragraphs.map(p => p.textContent.trim()).filter(Boolean).join('\n\n');
                    }

                    // 본문 추출 검증 성공 시 팝업 정지 및 클로즈
                    if (pureBodyText && pureBodyText.length > 50) {
                        clearInterval(timer);
                        
                        // 에피소드 제목 추출
                        let episodeTitle = 'Untitled Episode';
                        const numElem = popupDoc.querySelector('.ne-h1, .ne-num, h1');
                        if (numElem) {
                            episodeTitle = numElem.textContent.trim();
                        }

                        popup.close();

                        // 섀도 돔 노드 내부만 타겟팅했으므로 상하단 메뉴 찌꺼기가 원천 배제되어 자를 필요가 없습니다.
                        pureBodyText = cleanText(pureBodyText);
                        if (pureBodyText.startsWith(episodeTitle)) {
                            pureBodyText = pureBodyText.slice(episodeTitle.length).trim();
                        }

                        resolve({
                            episodeTitle: episodeTitle,
                            content: pureBodyText
                        });
                    }
                }
            } catch (e) {
                // 로딩 초기 순간 브라우저 예외 차단
            }

            if (checkAttempts >= maxAttempts) {
                clearInterval(timer);
                console.error(`Timeout waiting for unlocked shadow DOM tree on: ${url}`);
                try { popup.close(); } catch(_) {}
                resolve(null);
            }
        }, 200);
    });
}

function unescapeHTML(text) {
    const entities = {
        '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'",
        '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '--', '&lsquo;': "'",
        '&raquo;': "'", '&ldquo;': '"', '&rdquo;': '"'
    };
    Object.entries(entities).forEach(([entity, replacement]) => {
        text = text.replace(new RegExp(entity, 'g'), replacement);
    });
    return text;
}

function cleanText(text) {
    text = unescapeHTML(text);
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n');
}

function createModal(title) {
    if (!document.getElementById('novel-dl-styles')) {
        const style = document.createElement('style');
        style.id = 'novel-dl-styles';
        style.textContent = `
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }

    const modal = document.createElement('div');
    modal.id = 'downloadProgressModal';
    Object.assign(modal.style, {
        display: 'flex', zIndex: '9999', position: 'fixed', left: '0', top: '0',
        width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    });

    const modalContent = document.createElement('div');
    Object.assign(modalContent.style, {
        backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        width: '450px', maxWidth: '90%', padding: '0', overflow: 'hidden', animation: 'fadeIn 0.3s'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
        backgroundColor: '#f9f9fb', borderBottom: '1px solid #eaecef',
        padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    });
    
    const headerTitle = document.createElement('h3');
    headerTitle.textContent = title;
    Object.assign(headerTitle.style, { margin: '0', color: '#172238', fontSize: '16px', fontWeight: '600' });
    header.appendChild(headerTitle);
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    Object.assign(closeButton.style, {
        background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#666', padding: '0 4px', lineHeight: '1'
    });
    closeButton.onclick = () => { if (confirm('Do you want to cancel the download?')) { document.body.removeChild(modal); } };
    header.appendChild(closeButton);
    modalContent.appendChild(header);

    const body = document.createElement('div');
    Object.assign(body.style, { padding: '20px' });
    modalContent.appendChild(body);

    const statusElement = document.createElement('div');
    Object.assign(statusElement.style, { marginBottom: '16px', fontSize: '14px', color: '#444', fontWeight: '500' });
    body.appendChild(statusElement);

    const progressInfo = document.createElement('div');
    Object.assign(progressInfo.style, { display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', color: '#555' });
    
    const progressText = document.createElement('div');
    progressText.textContent = '0%';
    Object.assign(progressText.style, { fontWeight: '600' });
    progressInfo.appendChild(progressText);
    
    const timeRemaining = document.createElement('div');
    progressInfo.appendChild(timeRemaining);
    body.appendChild(progressInfo);

    const progressBarContainer = document.createElement('div');
    Object.assign(progressBarContainer.style, { width: '100%', height: '8px', backgroundColor: '#eaecef', borderRadius: '8px', overflow: 'hidden' });
    
    const progressBar = document.div = document.createElement('div');
    Object.assign(progressBar.style, {
        width: '0%', height: '100%', background: 'linear-gradient(90deg, #3a7bd5, #6fa1ff)', borderRadius: '8px', transition: 'width 0.3s ease'
    });
    progressBarContainer.appendChild(progressBar);
    body.appendChild(progressBarContainer);

    const detailedProgress = document.createElement('div');
    Object.assign(detailedProgress.style, { marginTop: '16px', fontSize: '13px', color: '#666', textAlign: 'center' });
    body.appendChild(detailedProgress);

    modal.appendChild(modalContent);
    return { modal, statusElement, progressText, timeRemaining, progressBar, detailedProgress };
}

function createProgressTracker(totalItems) {
    const startTime = Date.now();
    const processingTimes = [];
    const MAX_SAMPLES = 5;
    
    return {
        update: (completedItems) => {
            const progress = (completedItems / totalItems) * 100;
            const elapsed = Date.now() - startTime;
            
            if (completedItems > 0) {
                const currentTimePerItem = elapsed / completedItems;
                processingTimes.push(currentTimePerItem);
                if (processingTimes.length > MAX_SAMPLES) processingTimes.shift();
            }
            
            const avgTimePerItem = processingTimes.length > 0 
                ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
                : 0;
            
            const remainingItems = totalItems - completedItems;
            const estimatedRemainingTime = avgTimePerItem * remainingItems;
            
            return {
                progress: progress.toFixed(1),
                remaining: formatTime(estimatedRemainingTime),
                elapsed: formatTime(elapsed),
                speed: (avgTimePerItem > 0) ? (1000 / avgTimePerItem).toFixed(2) : "0.00"
            };
        }
    };
}

async function downloadNovel(title, episodeLinks, startEpisode, endEpisode, delayMs = 5000) {
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
        position: 'fixed', zIndex: '9999', left: '0', top: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    });

    const dialogContent = document.createElement('div');
    Object.assign(dialogContent.style, {
        backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        width: '350px', maxWidth: '90%', padding: '24px', animation: 'fadeIn 0.3s'
    });

    const dialogTitle = document.createElement('h3');
    dialogTitle.textContent = 'Select Save Mode';
    Object.assign(dialogTitle.style, { margin: '0 0 20px 0', color: '#172238', fontSize: '18px', fontWeight: '600' });
    dialogContent.appendChild(dialogTitle);

    const optionsContainer = document.createElement('div');
    Object.assign(optionsContainer.style, { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' });

    const createOption = (value, text, description) => {
        const option = document.createElement('div');
        Object.assign(option.style, {
            padding: '14px', border: '1px solid #e4e9f0', borderRadius: '8px',
            cursor: 'pointer', backgroundColor: '#f9f9fb', transition: 'all 0.2s ease'
        });
        option.innerHTML = `
            <div style="font-weight: 600; color: #172238; margin-bottom: 4px;">${text}</div>
            <div style="font-size: 13px; color: #666;">${description}</div>
        `;
        option.onclick = () => {
            document.body.removeChild(dialog);
            processDownload(value === '1' ? false : true);
        };
        option.onmouseover = () => { option.style.backgroundColor = '#f0f2f8'; option.style.borderColor = '#3a7bd5'; };
        option.onmouseout = () => { option.style.backgroundColor = '#f9f9fb'; option.style.borderColor = '#e4e9f0'; };
        return option;
    };

    optionsContainer.appendChild(createOption('1', 'Merge into a single file', 'All episodes will be saved in a single text file.'));
    optionsContainer.appendChild(createOption('2', 'Save per episode (ZIP)', 'Each episode will be saved as an individual text file inside a ZIP archive.'));
    dialogContent.appendChild(optionsContainer);
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    Object.assign(cancelButton.style, {
        width: '100%', padding: '10px', border: '1px solid #e4e9f0', borderRadius: '8px',
        backgroundColor: '#f9f9fb', cursor: 'pointer', fontSize: '14px', fontWeight: '500'
    });
    cancelButton.onclick = () => document.body.removeChild(dialog);
    dialogContent.appendChild(cancelButton);
    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    async function processDownload(saveAsZip) {
        let zip;
        if (saveAsZip) {
            try {
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
                zip = new JSZip();
            } catch (e) {
                alert('Failed to load ZIP library!');
                return;
            }
        }

        const startingIndex = startEpisode - 1;
        const endingIndex = endEpisode - 1;
        const totalEpisodes = endingIndex - startingIndex + 1;

        const { modal, statusElement, progressText, timeRemaining, progressBar, detailedProgress } = createModal(`"${title}" Downloading`);
        document.body.appendChild(modal);
        
        const progressTracker = createProgressTracker(totalEpisodes);
        let novelText = `${title}\n\nDownloaded with novel-dl\n\n`;
        let completedEpisodes = 0;
        let failedEpisodes = 0;
        let captchaCount = 0;

        statusElement.textContent = 'Preparing download...';
        
        for (let i = startingIndex; i <= endingIndex; i++) {
            let episodeUrl = episodeLinks[i];
            if (!episodeUrl) continue;
            
            if (episodeUrl.startsWith('/')) {
                episodeUrl = window.location.origin + episodeUrl;
            }

            const currentEpisode = i - startingIndex + 1;
            statusElement.textContent = `Downloading... (${currentEpisode}/${totalEpisodes})`;

            let result = await fetchNovelContent(episodeUrl);
            if (!result) {
                captchaCount++;
                const userConfirmed = confirm(`Bypass alert trigger! \n${episodeUrl}\nPlease make sure popups are allowed and click OK to retry.`);
                if (!userConfirmed) { failedEpisodes++; continue; }
                result = await fetchNovelContent(episodeUrl);
                if (!result) { failedEpisodes++; continue; }
            }

            const { episodeTitle, content} = result;
            if (saveAsZip) {
                zip.file(`${sanitizeFilename(episodeTitle)}.txt`, content);
            } else {
                novelText += `${episodeTitle}\n\n${content}\n\n`;
            }

            completedEpisodes++;
            const stats = progressTracker.update(completedEpisodes);
            
            progressBar.style.width = `${stats.progress}%`;
            progressText.textContent = `${stats.progress}%`;
            timeRemaining.textContent = `Time remaining: ${stats.remaining}`;
            detailedProgress.innerHTML = `
                <div style="margin-bottom: 4px; display: flex; justify-content: center; gap: 12px;">
                    <span>✅ OK: ${completedEpisodes}</span>
                    <span>❌ Fail: ${failedEpisodes}</span>
                </div>
                <div>Elapsed: ${stats.elapsed} | Speed: ${stats.speed} ep/s</div>
            `;
            await new Promise(r => setTimeout(r, delayMs));
        }

        statusElement.textContent = '✅ Completed!';
        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        
        setTimeout(() => {
            document.body.removeChild(modal);
            if (saveAsZip) {
                zip.generateAsync({type: 'blob'}).then(blob => {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `${sanitizeFilename(title)}.zip`;
                    a.click();
                });
            } else {
                const blob = new Blob([novelText], {type: 'text/plain'});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${sanitizeFilename(title)}(${startEpisode}-${endEpisode}).txt`;
                a.click();
            }
        }, 500);
    }
}

function extractTitle() {
    const titleElement = document.querySelector('.novel-detail h1');
    if (titleElement) return titleElement.textContent.replace(/[&"']/g, '').trim();
    return document.title ? document.title.split('-')[0].replace(/[&"']/g, '').trim() : null;
}

function extractEpisodeLinks() {
    const links = document.querySelectorAll('.novel-eps li a');
    return Array.from(links).map(link => link.getAttribute('href')).filter(Boolean).reverse();
}

async function runCrawler() {
    if (!window.location.pathname.includes('/novel/')) {
        alert('This script must be executed on the novel listing page.');
        return;
    }

    const title = extractTitle();
    if (!title) {
        alert('Failed to extract the novel title.');
        return;
    }

    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
        position: 'fixed', zIndex: '9999', left: '0', top: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    });

    const dialogContent = document.createElement('div');
    Object.assign(dialogContent.style, {
        backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        width: '400px', maxWidth: '90%', padding: '24px', animation: 'fadeIn 0.3s'
    });

    const dialogTitle = document.createElement('h3');
    dialogTitle.textContent = `"${title}" Settings`;
    Object.assign(dialogTitle.style, { margin: '0 0 20px 0', color: '#172238', fontSize: '18px', fontWeight: '600' });
    dialogContent.appendChild(dialogTitle);

    function createInputGroup(labelText, inputType, defaultValue, placeholder, description) {
        const group = document.createElement('div');
        group.style.marginBottom = '20px';
        
        const label = document.createElement('label');
        label.textContent = labelText;
        Object.assign(label.style, { display: 'block', marginBottom: '8px', fontSize: '14px', color: '#444', fontWeight: '500' });
        group.appendChild(label);
        
        if (description) {
            const desc = document.createElement('div');
            desc.textContent = description;
            Object.assign(desc.style, { fontSize: '13px', color: '#666', marginBottom: '8px' });
            group.appendChild(desc);
        }
        
        const input = document.createElement('input');
        input.type = inputType; input.value = defaultValue; input.placeholder = placeholder || '';
        Object.assign(input.style, { width: '100%', padding: '10px', border: '1px solid #e4e9f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' });
        group.appendChild(input);
        
        return { group, input };
    }

    const pagesInput = createInputGroup('Number of List Pages', 'number', '1', '', 'If all episodes are loaded on one page, keep it as 1.');
    dialogContent.appendChild(pagesInput.group);

    const buttonsContainer = document.createElement('div');
    Object.assign(buttonsContainer.style, { display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '12px' });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    Object.assign(cancelButton.style, {
        flex: '1', padding: '10px', border: '1px solid #e4e9f0', borderRadius: '8px', backgroundColor: '#f9f9fb', cursor: 'pointer'
    });
    cancelButton.onclick = () => document.body.removeChild(dialog);
    buttonsContainer.appendChild(cancelButton);

    const continueButton = document.createElement('button');
    continueButton.textContent = 'Continue';
    Object.assign(continueButton.style, {
        flex: '1', padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: '#3a7bd5', color: 'white', cursor: 'pointer'
    });
    buttonsContainer.appendChild(continueButton);
    dialogContent.appendChild(buttonsContainer);
    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    continueButton.onclick = async () => {
        document.body.removeChild(dialog);

        const loadingDialog = document.createElement('div');
        Object.assign(loadingDialog.style, {
            position: 'fixed', zIndex: '9999', left: '0', top: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        });
        const loadingContent = document.createElement('div');
        Object.assign(loadingContent.style, { backgroundColor: '#fff', borderRadius: '12px', width: '300px', padding: '24px', textAlign: 'center' });
        const loadingText = document.createElement('p');
        loadingText.textContent = 'Loading episode list...';
        loadingContent.appendChild(loadingText);
        loadingDialog.appendChild(loadingContent);
        document.body.appendChild(loadingDialog);

        const allEpisodeLinks = extractEpisodeLinks();
        document.body.removeChild(loadingDialog);

        if (allEpisodeLinks.length === 0) {
            alert('Failed to fetch the episode list. Please check the page structure.');
            return;
        }

        const rangeDialog = document.createElement('div');
        Object.assign(rangeDialog.style, {
            position: 'fixed', zIndex: '9999', left: '0', top: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        });

        const rangeContent = document.createElement('div');
        Object.assign(rangeContent.style, { backgroundColor: '#fff', borderRadius: '12px', width: '400px', padding: '24px' });

        const rangeTitle = document.createElement('h3');
        rangeTitle.textContent = 'Configure Download Range';
        rangeContent.appendChild(rangeTitle);

        const episodeCount = document.createElement('div');
        episodeCount.innerHTML = `<span style="background-color: #ebf5ff; color: #3a7bd5; padding: 4px 8px; border-radius: 4px;">Total ${allEpisodeLinks.length} Episodes</span>`;
        rangeContent.appendChild(episodeCount);

        const startInput = createInputGroup('Start Episode', 'number', '1', '');
        rangeContent.appendChild(startInput.group);

        const endInput = createInputGroup('End Episode', 'number', allEpisodeLinks.length.toString(), '');
        rangeContent.appendChild(endInput.group);
        
        const delayInput = createInputGroup('Delay (ms)', 'number', '5000', '', '⚠️ Recommended: Keep 5000ms (5s) to avoid blocks.');
        rangeContent.appendChild(delayInput.group);

        const rangeButtons = document.createElement('div');
        Object.assign(rangeButtons.style, { display: 'flex', justifyContent: 'space-between', marginTop: '20px', gap: '12px' });

        const rangeCancelButton = document.createElement('button');
        rangeCancelButton.textContent = 'Cancel';
        rangeCancelButton.onclick = () => document.body.removeChild(rangeDialog);
        rangeButtons.appendChild(rangeCancelButton);

        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download';
        rangeButtons.appendChild(downloadButton);
        rangeContent.appendChild(rangeButtons);
        rangeDialog.appendChild(rangeContent);
        document.body.appendChild(rangeDialog);

        downloadButton.onclick = () => {
            const startEpisode = parseInt(startInput.input.value, 10);
            const endEpisode = parseInt(endInput.input.value, 10);
            const delay = parseInt(delayInput.input.value, 10);

            // [오타 수정 완료] IsNaN -> isNaN 교정으로 콘솔 에러 완벽 차단
            if (isNaN(startEpisode) || isNaN(endEpisode) || startEpisode < 1 || endEpisode < startEpisode || endEpisode > allEpisodeLinks.length) {
                alert('Please enter a valid episode range.');
                return;
            }

            document.body.removeChild(rangeDialog);
            downloadNovel(title, allEpisodeLinks, startEpisode, endEpisode, delay);
        };
    };
}

runCrawler();
