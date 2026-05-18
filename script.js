async function fetchNovelContent(url) {
    return new Promise((resolve) => {
        // 1. 가상 iframe 창 생성
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);

        iframe.onload = async () => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                
                // Next.js 동적 렌더링 및 하이드레이션이 끝날 때까지 1초간 충분히 대기
                await new Promise(r => setTimeout(r, 1000));

                // 에피소드 제목 추출
                let episodeTitle = 'Untitled Episode';
                const numElem = iframeDoc.querySelector('.ne-h1, .ne-num, h1');
                if (numElem) {
                    episodeTitle = numElem.textContent.trim();
                }

                // 2. [핵심] 아무런 편집, 필터링 없이 Ctrl+A 한 것처럼 전체 innerText를 날것 그대로 가져옴
                const rawFullText = iframeDoc.body.innerText;

                // 사용한 iframe 메모리 해제
                document.body.removeChild(iframe);

                // 최소한의 데이터 유효성만 검증 (페이지가 통째로 비어있는지 체크)
                if (!rawFullText || rawFullText.length < 50) {
                    console.error(`Page text is empty or failed to render: ${url}`);
                    resolve(null);
                } else {
                    // 아무것도 편집하지 않고 수집된 원본 텍스트를 그대로 반환
                    resolve({
                        episodeTitle: episodeTitle,
                        content: rawFullText
                    });
                }
            } catch (e) {
                console.error(`Error capturing raw text inside iframe for ${url}:`, e);
                try { document.body.removeChild(iframe); } catch(_) {}
                resolve(null);
            }
        };
    });
}

// 기존 인터페이스 호환용 함수 (가공하지 않고 원본 전달)
function cleanText(text) {
    return text; 
}

function unescapeHTML(text) {
    return text;
}

// ... 이하 createModal, downloadNovel, runCrawler 등 기존 UI 제어 코드 결합 구동
