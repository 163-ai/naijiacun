using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        bool selfTest = args.Length == 1 && args[0] == "/self-test";
        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (selfTest)
            {
                using (PetWindow pet = new PetWindow()) pet.SelfTest();
                return 0;
            }
            Application.Run(new PetWindow());
            return 0;
        }
        catch (Exception error)
        {
            if (selfTest) Console.WriteLine("SELF-TEST FAIL: " + error.Message);
            else MessageBox.Show(error.Message, "奶家村桌宠", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}

internal sealed class PetWindow : Form
{
    private static readonly string[] Ids = { "nailong", "naiwa", "baobaolong", "xiaoqi", "niulai", "capybara", "naicha", "naidan", "feidudu" };
    private static readonly string[] Names = { "奶龙", "奶蛙", "暴暴龙", "小七", "牛来", "卡皮巴拉", "奶察", "奶蛋", "肥嘟嘟袋鼠" };
    private static readonly int[] Heights = { 160, 240, 320 };
    private readonly ContextMenuStrip menu = new ContextMenuStrip();
    private readonly ToolStripMenuItem characters = new ToolStripMenuItem("切换角色");
    private readonly ToolStripMenuItem sizes = new ToolStripMenuItem("角色大小");
    private Bitmap source;
    private byte[] pixels;
    private int character;
    private int logicalHeight = 240;
    private int dpi = 96;
    private bool placed;

    internal PetWindow()
    {
        Text = "奶家村桌宠";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        MaximizeBox = false;
        MinimizeBox = false;
        source = LoadPet(Ids[0]);
        for (int i = 0; i < Ids.Length; i++)
        {
            int index = i;
            ToolStripMenuItem item = new ToolStripMenuItem(Names[i]);
            item.Click += delegate { SelectCharacter(index); };
            characters.DropDownItems.Add(item);
        }
        string[] labels = { "小 · 160", "中 · 240", "大 · 320" };
        for (int i = 0; i < Heights.Length; i++)
        {
            int height = Heights[i];
            ToolStripMenuItem item = new ToolStripMenuItem(labels[i]);
            item.Click += delegate { logicalHeight = height; RenderPet(); };
            sizes.DropDownItems.Add(item);
        }
        menu.Items.Add(characters);
        menu.Items.Add(sizes);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出桌宠", null, delegate { Close(); });
        UpdateChecks();
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams parameters = base.CreateParams;
            parameters.ExStyle |= 0x00080000 | 0x00000080 | 0x08000000 | 0x00000008;
            return parameters; // Layered, tool window, no activation, topmost.
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try { dpi = (int)Native.GetDpiForWindow(Handle); }
        catch (EntryPointNotFoundException)
        {
            using (Graphics graphics = Graphics.FromHwnd(IntPtr.Zero)) dpi = (int)graphics.DpiY;
        }
        RenderPet();
    }

    private static Bitmap LoadPet(string id)
    {
        using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Pets." + id + ".png"))
        using (Bitmap image = new Bitmap(stream)) return new Bitmap(image);
    }

    private void SelectCharacter(int index)
    {
        Bitmap next = LoadPet(Ids[index]);
        source.Dispose();
        source = next;
        character = index;
        RenderPet();
    }

    private void UpdateChecks()
    {
        for (int i = 0; i < Ids.Length; i++) ((ToolStripMenuItem)characters.DropDownItems[i]).Checked = i == character;
        for (int i = 0; i < Heights.Length; i++) ((ToolStripMenuItem)sizes.DropDownItems[i]).Checked = Heights[i] == logicalHeight;
    }

    private void RenderPet()
    {
        int height = Math.Max(1, (int)Math.Round(logicalHeight * dpi / 96.0));
        int width = Math.Max(1, (int)Math.Round(height * source.Width / (double)source.Height));
        Point position = placed ? new Point(Left + (Width - width) / 2, Bottom - height) : Point.Empty;
        using (Bitmap frame = new Bitmap(width, height, PixelFormat.Format32bppPArgb))
        {
            using (Graphics graphics = Graphics.FromImage(frame))
            using (ImageAttributes attributes = new ImageAttributes())
            {
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                attributes.SetWrapMode(WrapMode.TileFlipXY);
                graphics.DrawImage(source, new Rectangle(0, 0, width, height), 0, 0, source.Width, source.Height, GraphicsUnit.Pixel, attributes);
            }
            BitmapData data = frame.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format32bppPArgb);
            try
            {
                pixels = new byte[width * height * 4];
                Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
            }
            finally { frame.UnlockBits(data); }
        }
        Size = new Size(width, height);
        if (!placed)
        {
            Rectangle work = Screen.PrimaryScreen.WorkingArea;
            position = new Point(work.Right - width - 40, work.Bottom - height - 20);
            placed = true;
        }
        Location = position;
        KeepOnScreen();
        Native.Update(Handle, pixels, Bounds);
        UpdateChecks();
    }

    private void KeepOnScreen()
    {
        Rectangle work = Screen.FromRectangle(Bounds).WorkingArea;
        Location = new Point(Math.Max(work.Left, Math.Min(Left, work.Right - Width)), Math.Max(work.Top, Math.Min(Top, work.Bottom - Height)));
    }

    protected override void WndProc(ref Message message)
    {
        const int WM_NCHITTEST = 0x84, WM_NCRBUTTONDOWN = 0xA4, WM_NCRBUTTONUP = 0xA5;
        const int WM_NCLBUTTONDBLCLK = 0xA3, WM_RBUTTONUP = 0x205, WM_EXITSIZEMOVE = 0x232, WM_DPICHANGED = 0x2E0;
        if (message.Msg == WM_NCHITTEST && pixels != null)
        {
            long packed = message.LParam.ToInt64();
            Point point = PointToClient(new Point((short)(packed & 0xFFFF), (short)((packed >> 16) & 0xFFFF)));
            bool hit = point.X >= 0 && point.Y >= 0 && point.X < Width && point.Y < Height && pixels[(point.Y * Width + point.X) * 4 + 3] != 0;
            message.Result = new IntPtr(hit ? 2 : -1); // Caption drag on visible pixels; transparent pixels pass through.
            return;
        }
        if (message.Msg == WM_NCRBUTTONUP || message.Msg == WM_RBUTTONUP)
        {
            menu.Show(Cursor.Position);
            return;
        }
        if (message.Msg == WM_NCRBUTTONDOWN || message.Msg == WM_NCLBUTTONDBLCLK) return;
        if (message.Msg == WM_EXITSIZEMOVE) KeepOnScreen();
        if (message.Msg == WM_DPICHANGED)
        {
            dpi = message.WParam.ToInt32() & 0xFFFF;
            RenderPet();
            return;
        }
        base.WndProc(ref message);
    }

    internal void SelfTest()
    {
        IntPtr window = Handle; // Create a real, hidden native window; never call Show.
        long style = Native.WindowStyle(window, -16), extended = Native.WindowStyle(window, -20);
        Require(FormBorderStyle == FormBorderStyle.None && !ShowInTaskbar && TopMost && !Visible, "window properties");
        Require((style & 0x00C40000) == 0, "window has a frame");
        Require((extended & 0x08080088) == 0x08080088 && (extended & 0x00040000) == 0, "native layered/tool/topmost/noactivate styles");
        Require(character == 0 && logicalHeight == 240, "default character/size");
        for (int i = 0; i < Ids.Length; i++)
        {
            ((ToolStripMenuItem)characters.DropDownItems[i]).PerformClick();
            Require(character == i, "character menu: " + Ids[i]);
            int left = source.Width, top = source.Height, right = -1, bottom = -1;
            for (int y = 0; y < source.Height; y++)
                for (int x = 0; x < source.Width; x++)
                    if (source.GetPixel(x, y).A != 0)
                    {
                        left = Math.Min(left, x); top = Math.Min(top, y);
                        right = Math.Max(right, x); bottom = Math.Max(bottom, y);
                    }
            Require(left == 0 && top == 0 && right == source.Width - 1 && bottom == source.Height - 1, "uncropped resource: " + Ids[i]);
            for (int size = 0; size < Heights.Length; size++)
            {
                ((ToolStripMenuItem)sizes.DropDownItems[size]).PerformClick();
                Require(logicalHeight == Heights[size] && Height == (int)Math.Round(Heights[size] * dpi / 96.0), "size menu");
                int transparent = 0, partial = 0, opaque = 0;
                int transparentPixel = -1, opaquePixel = -1;
                for (int pixel = 3; pixel < pixels.Length; pixel += 4)
                {
                    if (pixels[pixel] == 0) { transparent++; transparentPixel = pixel / 4; }
                    else if (pixels[pixel] == 255) { opaque++; opaquePixel = pixel / 4; }
                    else partial++;
                    Require(pixels[pixel - 3] <= pixels[pixel] && pixels[pixel - 2] <= pixels[pixel] && pixels[pixel - 1] <= pixels[pixel], "non-premultiplied alpha");
                }
                Require(transparent > 0 && partial > 0 && opaque > 0, "alpha coverage: " + Ids[i]);
                Require(HitTest(transparentPixel) == -1 && HitTest(opaquePixel) == 2, "transparent/drag hit test: " + Ids[i]);
            }
            Console.WriteLine("RESOURCE " + Ids[i] + " " + source.Width + "x" + source.Height + " alpha=cropped");
        }
        Require(!Visible, "self-test displayed a window");
        Console.WriteLine("SELF-TEST PASS: 9 resources, 27 size renders/uploads, alpha, pixel hit tests, menus, hidden borderless layered topmost tool window; dpi=" + dpi);
    }

    private long HitTest(int pixel)
    {
        Point point = PointToScreen(new Point(pixel % Width, pixel / Width));
        int packed = (point.X & 0xFFFF) | ((point.Y & 0xFFFF) << 16);
        return Native.SendMessage(Handle, 0x84, IntPtr.Zero, new IntPtr(packed)).ToInt64();
    }

    private static void Require(bool passed, string detail)
    {
        if (!passed) throw new InvalidOperationException(detail);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { source.Dispose(); menu.Dispose(); }
        base.Dispose(disposing);
    }
}

internal static class Native
{
    [StructLayout(LayoutKind.Sequential)] private struct Point { internal int X, Y; internal Point(int x, int y) { X = x; Y = y; } }
    [StructLayout(LayoutKind.Sequential)] private struct Size { internal int Width, Height; internal Size(int w, int h) { Width = w; Height = h; } }
    [StructLayout(LayoutKind.Sequential, Pack = 1)] private struct Blend { internal byte Operation, Flags, Alpha, Format; }
    [StructLayout(LayoutKind.Sequential)] private struct BitmapInfo
    {
        internal uint HeaderSize;
        internal int Width, Height;
        internal ushort Planes, BitCount;
        internal uint Compression, ImageSize;
        internal int XPixels, YPixels;
        internal uint ColorsUsed, ColorsImportant, Color;
    }

    [DllImport("user32.dll")] internal static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] internal static extern IntPtr SendMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr window, IntPtr dc);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr dc, IntPtr item);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr item);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateDIBSection(IntPtr dc, ref BitmapInfo info, uint usage, out IntPtr bits, IntPtr section, uint offset);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UpdateLayeredWindow(IntPtr window, IntPtr screen, ref Point position, ref Size size, IntPtr source, ref Point origin, uint key, ref Blend blend, uint flags);

    internal static long WindowStyle(IntPtr window, int index)
    {
        return IntPtr.Size == 8 ? GetWindowLongPtr(window, index).ToInt64() : GetWindowLong(window, index);
    }

    internal static void Update(IntPtr window, byte[] pixels, Rectangle bounds)
    {
        IntPtr screen = GetDC(IntPtr.Zero), dc = CreateCompatibleDC(screen), bitmap = IntPtr.Zero, previous = IntPtr.Zero;
        try
        {
            BitmapInfo info = new BitmapInfo();
            info.HeaderSize = 40; info.Width = bounds.Width; info.Height = -bounds.Height; info.Planes = 1; info.BitCount = 32;
            IntPtr bits;
            bitmap = CreateDIBSection(screen, ref info, 0, out bits, IntPtr.Zero, 0);
            if (bitmap == IntPtr.Zero) throw new InvalidOperationException("无法创建桌宠透明位图。");
            Marshal.Copy(pixels, 0, bits, pixels.Length);
            previous = SelectObject(dc, bitmap);
            Point position = new Point(bounds.Left, bounds.Top), origin = new Point(0, 0);
            Size size = new Size(bounds.Width, bounds.Height);
            Blend blend = new Blend(); blend.Alpha = 255; blend.Format = 1;
            if (!UpdateLayeredWindow(window, screen, ref position, ref size, dc, ref origin, 0, ref blend, 2))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        finally
        {
            if (previous != IntPtr.Zero) SelectObject(dc, previous);
            if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
            DeleteDC(dc);
            ReleaseDC(IntPtr.Zero, screen);
        }
    }
}
