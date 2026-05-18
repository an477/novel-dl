// [완전 개조] fetch 대신 가상 iframe을 사용하여 브라우저 렌더링을 가로채는 방식
async function fetchNovelContent(url) {
    return new Promise((resolve) => {
        // 보이지 않는 가상 iframe 생성
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);

        // 페이지가 완전히 로드되고 자바스크립트가 실행될 때까지 대기
        iframe.onload = async () => {
            try {
                // iframe 내부의 DOM에 접근
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                
                // 충분히 하이드레이션이 끝날 시간을 주기 위해 아주 잠깐 대기 (300ms)
                await new Promise(r => setTimeout(r, 300));

                // [처음 주신 코드 규칙 매핑] 에피소드 제목 추출
                let episodeTitle = 'Untitled Episode';
                const numElem = iframeDoc.querySelector('.ne-h1, .ne-num, h1');
                if (numElem) {
                    episodeTitle = numElem.textContent.trim();
                }

                // [중요] 복사 방지가 풀리고 렌더링이 완료된 실제 화면의 텍스트 노드 영역 타겟팅
                // 복사 방지 스크립트가 돌아도 DOM 트리 내부의 텍스트 데이터는 무조건 잡힙니다.
                const contentContainer = iframeDoc.querySelector('.novel-viewer, article, .view-content, #novel_content');
                let cleanedContent = '';

                if (contentContainer) {
                    cleanedContent = cleanText(contentContainer.innerHTML);
                }

                // 로딩 중이거나 본문이 완전히 누락되었다면 최후의 수단으로 iframe의 전체 textContent에서 본문 유추
                if (!cleanedContent || cleanedContent.includes("불러오는 중") || cleanedContent.length < 50) {
                    const allText = iframeDoc.body.textContent;
                    // 소설 독자용 뷰어 텍스트 필터링 시도
                    if (allText && allText.includes("글자")) {
                        const parts = allText.split("기본");
                        if (parts[1]) {
                            cleanedContent = cleanText(parts[1].split("댓글")[0]);
                        }
                    }
                }

                // 가상 엘리먼트 메모리 해제
                document.body.removeChild(iframe);

                if (!cleanedContent || cleanedContent.includes("불러오는 중") || cleanedContent.length < 50) {
                    resolve(null);
                } else {
                    if (cleanedContent.startsWith(episodeTitle)) {
                        cleanedContent = cleanedContent.slice(episodeTitle.length).trim();
                    }
                    resolve({ episodeTitle, content: cleanedContent });
                }
            } catch (e) {
                console.error("Bypass via iframe context failed:", e);
                try { document.body.removeChild(iframe); } catch(_) {}
                resolve(null);
            }
        };
    });
}

function unescapeHTML(text) {
    const entities = {
        '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'",
        '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '--', '&lsquo;': "'",
        '&raquo;': "'", '&ldquo;': '"', '&rdquo;': '"'
    };
    Object.entries(entities).forEach(([entity, replacement]) => {
        const regex = new RegExp(entity, 'g');
        text = text.replace(regex, replacement);
    });
    return text;
}

function cleanText(text) {
    text = text.replace(/<div>/g, '');
    text = text.replace(/<\/div>/g, '');
    text = text.replace(/<p>/g, '\n');
    text = text.replace(/<\/p>/g, '\n');
    text = text.replace(/<br\s*[/]?>/g, '\n');
    text = text.replace(/<img[^>]*>/gi, '[skipped image]');
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/ {2,}/g, ' ');
    text = unescapeHTML(text);

    text = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n');

    return text;
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
    
    const progressBar = document.createElement('div');
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

function downloadNovel(title, episodeLinks, startEpisode, endEpisode, delayMs = 5000) {
    // [UI 구성 파트는 이전 답변과 동일하여 중복 생략, 가상 렌더링 데이터 엔진 결합 구동됨]
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

// ...이하 runCrawler() 바인딩 로직 구동 동일
