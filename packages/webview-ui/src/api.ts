
export default class SSEClientWithThinkTag {
  private static readonly THINK = '</think>';
  private static readonly prefixs = ['</think', '</thin', '</thi', '</th', '</t', '</', '<'];
  private buffer: string = '';
  private controller?: AbortController;
  public status: 'ready' | 'thinking' | 'answering' = 'ready';
  private count = 0;

  constructor(
    private readonly baseURL: string,
    private readonly thinkTag: boolean,
    private readonly open: (response: Response) => void,
    private readonly onmessage: (type: "thinking" | "answering", buffer: string) => void,
    private readonly onclose: () => void,
    private readonly onerror: (error: unknown) => void) {
  }

  public async invoke(content: string) {
    if (content.trim() === '' || this.status !== 'ready') {
      console.error('unready or empty content');
      return;
    }

    try {
      this.controller = new AbortController();
      // await (`${this.baseURL}/getStreamChat`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     Accept: 'text/event-stream',
      //   },
      //   body: JSON.stringify({ prompt: content }),
      //   signal: this.controller.signal,

      //   onopen: async (response: Response) => {
      //     console.log(`SSEClient: stream opened, response ok is ${response.ok}.`);
      //     this.buffer = "";
      //     this.status = this.thinkTag ? "thinking" : "answering";
      //     this.open(response);
      //   },
      //   onmessage: (event: EventSourceMessage) => {
      //     const chunk = event.data
      //       .replace(/data:/g, '')
      //       .replace(/\n/g, '')
      //       .replace(/<\|enter\|>/g, '\n');

      //     if (this.thinkTag === false) {
      //       this.onmessage("thinking", chunk);
      //       return;
      //     }

      //     if (this.status === 'thinking') {
      //       this.buffer += chunk;

      //       if (this.count < 10) {
      //         this.count += 1;
      //         return;
      //       } else if (this.buffer.startsWith("<think>")) {
      //         this.buffer = this.buffer.substring("<think>".length); 
      //       }

      //       if (this.buffer.includes(SSEClientWithThinkTag.THINK)) {
      //         const [before, after] = this.buffer
      //           .split(SSEClientWithThinkTag.THINK, 1)
      //           .concat(this.buffer.split(SSEClientWithThinkTag.THINK).slice(1).join(SSEClientWithThinkTag.THINK))
      //           .map((p) => p.trim());
      //         this.onmessage("thinking", before);
      //         this.onmessage("answering", after);
      //         this.status = 'answering';
      //         this.buffer = '';
      //         return;
      //       }

      //       for (const prefix of SSEClientWithThinkTag.prefixs) {
      //         if (this.buffer.endsWith(prefix)) {
      //           console.debug(this.buffer, 'end with', prefix);
      //           this.onmessage("thinking", this.buffer.substring(0, this.buffer.lastIndexOf(prefix)));
      //           this.buffer = this.buffer.substring(this.buffer.lastIndexOf(prefix));
      //           return;
      //         }
      //       }

      //       this.onmessage("thinking", this.buffer);
      //       this.buffer = '';
      //     } else {
      //       if (this.buffer !== '') console.error('assert error: buffer is not empty');
      //       this.onmessage("answering", chunk);
      //     }
      //   },
      //   onclose: () => {
      //     console.log("SSEClient: stream closed.");
      //     this.buffer = '';
      //     this.controller = undefined;
      //     this.status = 'ready';
      //     this.onclose();
      //   },
      //   onerror: (error: unknown) => {
      //     console.log(`SSEClient: stream error, ${error}.`);
      //     this.onmessage("answering", '无法连接到服务器。');
      //     this.onerror(error);

      //     this.buffer = '';
      //     this.controller = undefined;
      //     this.status = 'ready';

      //     throw new Error('SSE连接失败，停止重试');
      //   },
      // });
    } catch (error) {
      console.log(error);
    }
  }

  public async cancel() {
    if (this.controller) {
      console.log("Stream cancelled.");
      this.controller.abort();
      this.controller = undefined;
      this.buffer = '';
      this.status = 'ready';
    } else {
      console.warn("No active stream to cancel.");
    }
  }
}